/**
 * Local Server - WA Book Order Management
 * Run: node server.js
 * 
 * For development with Baileys
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3001;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    name TEXT,
    waGroupId TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    prefix TEXT,
    price REAL,
    nettPrice REAL,
    stock INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    waMessageId TEXT,
    groupId INTEGER,
    admin TEXT,
    bookId INTEGER,
    postedAt TEXT DEFAULT (datetime('now')),
    originalText TEXT,
    priceSnapshot REAL,
    stockSnapshot INTEGER,
    status TEXT DEFAULT 'Active',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (groupId) REFERENCES groups(id),
    FOREIGN KEY (bookId) REFERENCES books(id)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT NOT NULL,
    groupId INTEGER,
    code TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (groupId) REFERENCES groups(id)
  );

  CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    waMessageId TEXT,
    customerId INTEGER,
    groupId INTEGER,
    postId INTEGER,
    replyText TEXT,
    replyTimestamp TEXT DEFAULT (datetime('now')),
    parsedIntent TEXT,
    quantity INTEGER DEFAULT 1,
    status TEXT DEFAULT 'WAITING_STOCK_CHECK',
    decision TEXT,
    decisionTimestamp TEXT,
    decisionAdmin TEXT,
    decisionReason TEXT,
    includeInInvoice INTEGER DEFAULT 0,
    priceSnapshot REAL,
    itemStatus TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (customerId) REFERENCES customers(id),
    FOREIGN KEY (groupId) REFERENCES groups(id),
    FOREIGN KEY (postId) REFERENCES posts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_posts_groupId ON posts(groupId);
  CREATE INDEX IF NOT EXISTS idx_replies_groupId ON replies(groupId);
  CREATE INDEX IF NOT EXISTS idx_replies_status ON replies(status);
  CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code);
`);

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token'
};

// Auth check
function auth(req) {
  const token = req.headers['x-admin-token'];
  return token === ADMIN_TOKEN;
}

// JSON response helper
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders });
  res.end(JSON.stringify(data));
}

// Parse body helper
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Route handlers
const routes = {
  // Health
  'GET:/health': (req, res) => json(res, { status: 'ok' }),

  // Books
  'GET:/api/admin/books': (req, res) => {
    const books = db.prepare('SELECT * FROM books ORDER BY id DESC').all();
    json(res, books);
  },
  'POST:/api/admin/books': async (req, res, body) => {
    const { title, prefix, nettPrice, stock } = body;
    if (!title) return json(res, { error: 'Title required' }, 400);
    
    const info = db.prepare(`
      INSERT INTO books (title, prefix, price, nettPrice, stock, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Active', datetime('now'), datetime('now'))
    `).run(title, prefix || null, nettPrice, nettPrice, stock || 0);
    
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(info.lastInsertRowid);
    json(res, book, 201);
  },

  // Groups
  'GET:/api/admin/groups': (req, res) => {
    const groups = db.prepare('SELECT * FROM groups ORDER BY code').all();
    json(res, groups);
  },
  'POST:/api/admin/groups': async (req, res, body) => {
    const { code, name, waGroupId } = body;
    const info = db.prepare(`
      INSERT INTO groups (code, name, waGroupId, active, created_at)
      VALUES (?, ?, ?, 1, datetime('now'))
    `).run(code, name, waGroupId || null);
    
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(info.lastInsertRowid);
    json(res, group, 201);
  },
  'POST:/api/admin/groups/:id/:action': (req, res, params) => {
    const { id, action } = params;
    db.prepare('UPDATE groups SET active = ? WHERE id = ?').run(action === 'activate' ? 1 : 0, id);
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
    json(res, group);
  },

  // Posts
  'GET:/api/admin/posts': (req, res, params, query) => {
    let sql = `SELECT p.*, b.title as book_title, b.prefix as book_prefix, b.nettPrice as book_price, g.code as group_code 
               FROM posts p 
               LEFT JOIN books b ON p.bookId = b.id 
               LEFT JOIN groups g ON p.groupId = g.id`;
    
    if (query.groupId) {
      sql += ' WHERE p.groupId = ? ORDER BY p.postedAt DESC LIMIT 100';
      const posts = db.prepare(sql).all(query.groupId);
      return json(res, posts);
    }
    
    sql += ' ORDER BY p.postedAt DESC LIMIT 100';
    const posts = db.prepare(sql).all();
    json(res, posts);
  },
  'POST:/api/admin/posts': async (req, res, body) => {
    const { groupId, title, prefix, price, stock } = body;
    
    let bookId = null;
    if (title) {
      let book = db.prepare('SELECT * FROM books WHERE LOWER(title) = LOWER(?)').get(title);
      
      if (!book) {
        const info = db.prepare(`
          INSERT INTO books (title, prefix, price, nettPrice, stock, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'Active', datetime('now'))
        `).run(title, prefix || null, price, price, stock || 0);
        bookId = info.lastInsertRowid;
      } else {
        db.prepare(`UPDATE books SET prefix = COALESCE(?, prefix), nettPrice = COALESCE(?, nettPrice), stock = COALESCE(?, stock), updated_at = datetime('now') WHERE id = ?`)
          .run(prefix || null, price || null, stock !== undefined ? stock : null, book.id);
        bookId = book.id;
      }
    }
    
    const priceDisplay = price >= 1000 ? Math.round(price / 1000) + 'k' : String(price || '');
    const textPrefix = prefix ? prefix + ' ' : '';
    const originalText = title ? textPrefix + title + ' - ' + priceDisplay + ' nett' : '';
    
    const info = db.prepare(`
      INSERT INTO posts (groupId, bookId, admin, originalText, priceSnapshot, stockSnapshot, postedAt, status, created_at)
      VALUES (?, ?, 'admin', ?, ?, ?, datetime('now'), 'Active', datetime('now'))
    `).run(groupId, bookId, originalText, price, stock !== undefined ? stock : null);
    
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(info.lastInsertRowid);
    json(res, post, 201);
  },

  // Replies
  'GET:/api/admin/replies': (req, res, params, query) => {
    let sql = `SELECT r.*, c.name as customer_name, c.phone as customer_phone, c.code as customer_code,
               b.title as book_title, b.prefix as book_prefix, b.nettPrice as book_price, p.originalText as post_text
               FROM replies r
               LEFT JOIN customers c ON r.customerId = c.id
               LEFT JOIN posts p ON r.postId = p.id
               LEFT JOIN books b ON p.bookId = b.id`;
    
    if (query.status) {
      sql += ' WHERE r.status = ? ORDER BY r.replyTimestamp DESC LIMIT 200';
      const replies = db.prepare(sql).all(query.status);
      return json(res, replies);
    }
    
    sql += ' ORDER BY r.replyTimestamp DESC LIMIT 200';
    const replies = db.prepare(sql).all();
    json(res, replies);
  },
  'POST:/api/admin/replies/:id/confirm': (req, res, params, body) => {
    const { id } = params;
    const { adminName, quantity } = body;
    
    const reply = db.prepare('SELECT * FROM replies WHERE id = ?').get(id);
    if (!reply) return json(res, { error: 'Reply not found' }, 404);
    if (reply.status === 'INVOICED') return json(res, { error: 'Already confirmed' }, 409);
    
    const post = reply.postId ? db.prepare('SELECT * FROM posts WHERE id = ?').get(reply.postId) : null;
    const book = post && post.bookId ? db.prepare('SELECT * FROM books WHERE id = ?').get(post.bookId) : null;
    
    const qty = quantity || reply.quantity || 1;
    const price = reply.priceSnapshot || (post ? post.priceSnapshot : (book ? book.nettPrice : 0));
    
    if (book && book.stock >= qty) {
      db.prepare('UPDATE books SET stock = stock - ? WHERE id = ?').run(qty, book.id);
    }
    
    db.prepare(`
      UPDATE replies SET status = 'INVOICED', decision = 'YES', decisionTimestamp = datetime('now'),
      decisionAdmin = ?, quantity = ?, includeInInvoice = 1, priceSnapshot = ? WHERE id = ?
    `).run(adminName || 'admin', qty, price, id);
    
    const updated = db.prepare('SELECT * FROM replies WHERE id = ?').get(id);
    json(res, updated);
  },
  'POST:/api/admin/replies/:id/reject': (req, res, params, body) => {
    const { id } = params;
    const { adminName, reason } = body;
    
    db.prepare(`
      UPDATE replies SET status = 'REJECTED', decision = 'NO', decisionTimestamp = datetime('now'),
      decisionAdmin = ?, decisionReason = ?, includeInInvoice = 0 WHERE id = ?
    `).run(adminName || 'admin', reason || 'Stock unavailable', id);
    
    const updated = db.prepare('SELECT * FROM replies WHERE id = ?').get(id);
    json(res, updated);
  },

  // Summary
  'GET:/api/admin/reports/summary': (req, res) => {
    const totalBooks = db.prepare('SELECT COUNT(*) as count FROM books').get().count;
    const totalPosts = db.prepare('SELECT COUNT(*) as count FROM posts').get().count;
    const totalGroups = db.prepare('SELECT COUNT(*) as count FROM groups').get().count;
    const activeGroups = db.prepare('SELECT COUNT(*) as count FROM groups WHERE active = 1').get().count;
    const waitingStock = db.prepare("SELECT COUNT(*) as count FROM replies WHERE status = 'WAITING_STOCK_CHECK'").get().count;
    const invoiced = db.prepare("SELECT COUNT(*) as count FROM replies WHERE status IN ('INVOICED', 'CONFIRMED')").get().count;
    const rejected = db.prepare("SELECT COUNT(*) as count FROM replies WHERE status = 'REJECTED'").get().count;
    const totalRevenue = db.prepare("SELECT SUM(priceSnapshot * quantity) as total FROM replies WHERE includeInInvoice = 1").get().total || 0;
    const totalCustomers = db.prepare('SELECT COUNT(DISTINCT customerId) as count FROM replies').get().count;
    
    json(res, {
      totalBooks, totalPosts, totalGroups, activeGroups,
      waitingStockCheck: waitingStock,
      confirmedOrInvoiced: invoiced,
      rejected,
      totalRevenue,
      totalCustomers
    });
  },

  // WhatsApp
  'GET:/api/admin/whatsapp/status': (req, res) => {
    json(res, { status: 'READY_FOR_BAILEYS', message: 'Run server/baileys.js for WhatsApp connection' });
  },
  'GET:/api/admin/whatsapp/groups': (req, res) => {
    const groups = db.prepare('SELECT * FROM groups ORDER BY code').all();
    json(res, groups);
  },
  'POST:/api/admin/whatsapp/connect': (req, res) => {
    json(res, { status: 'USE_BAILEYS', message: 'Run: cd server && npm install && npm start' });
  },
  'POST:/api/admin/whatsapp/dripsender/configure': async (req, res, body) => {
    const { apiKey } = body;
    
    // Save to config file or env
    const configPath = path.join(__dirname, '..', 'data', 'config.json');
    const fs = require('fs');
    let config = {};
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    
    config.dripsenderApiKey = apiKey;
    config.whatsappProvider = 'dripsender';
    config.webhookEnabled = true;
    
    if (!fs.existsSync(path.dirname(configPath))) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    json(res, { 
      success: true, 
      provider: 'dripsender',
      message: 'DripSender configured. Set webhook URL in DripSender portal.'
    });
  },
  'POST:/api/admin/whatsapp/fonnte/configure': async (req, res, body) => {
    const { apiKey, deviceId } = body;
    
    // Save to config file
    const configPath = path.join(__dirname, '..', 'data', 'config.json');
    const fs = require('fs');
    let config = {};
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    
    config.fonnteApiKey = apiKey;
    config.fonnteDeviceId = deviceId || '';
    config.whatsappProvider = 'fonnte';
    config.webhookEnabled = true;
    
    if (!fs.existsSync(path.dirname(configPath))) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    json(res, { 
      success: true, 
      provider: 'fonnte',
      message: 'Fonnte configured. Set webhook URL in md.fonnte.com dashboard.'
    });
  },

  // Webhook from Baileys
  'POST:/api/webhook/message': async (req, res, body) => {
    const { waMessageId, fromJid, senderJid, senderName, messageText, timestamp, isGroup, groupJid } = body;
    
    console.log(`[WEBHOOK] ${senderName}: ${messageText.substring(0, 50)}`);
    
    // TODO: Implement message parsing, intent detection, customer creation, reply creation
    
    json(res, { success: true, messageId: waMessageId });
  },

  // Customer check
  'GET:/api/customer/check': (req, res, params, query) => {
    const { group, code } = query;
    
    if (!group || !code) return json(res, { error: 'group and code required' }, 400);
    
    const groupRow = db.prepare("SELECT * FROM groups WHERE LOWER(code) = LOWER(?) OR id = ?").get(group, group);
    if (!groupRow) return json(res, { error: 'Group not found' }, 404);
    
    const customer = db.prepare('SELECT * FROM customers WHERE groupId = ? AND code = ?').get(groupRow.id, code);
    if (!customer) return json(res, { error: 'Customer not found' }, 404);
    
    const items = db.prepare(`
      SELECT r.*, b.title as book_title, b.prefix as book_prefix
      FROM replies r
      LEFT JOIN posts p ON r.postId = p.id
      LEFT JOIN books b ON p.bookId = b.id
      WHERE r.customerId = ? AND r.includeInInvoice = 1 AND r.status != 'CANCELLED'
      ORDER BY r.decisionTimestamp DESC
    `).all(customer.id);
    
    const total = items.reduce((sum, item) => sum + ((item.priceSnapshot || 0) * (item.quantity || 1)), 0);
    
    json(res, {
      customer: { name: customer.name, phone: customer.phone, code: customer.code },
      group: { code: groupRow.code, name: groupRow.name },
      items: items.map(i => ({
        title: i.book_title || '(unknown)',
        prefix: i.book_prefix,
        price: i.priceSnapshot || 0,
        quantity: i.quantity || 1,
        subtotal: (i.priceSnapshot || 0) * (i.quantity || 1),
        status: i.itemStatus || i.status,
        timestamp: i.decisionTimestamp || i.replyTimestamp
      })),
      total
    });
  }
};

// Parse route
function matchRoute(method, pathname) {
  // Exact match
  const key = `${method}:${pathname}`;
  if (routes[key]) return { handler: routes[key], params: {}, query: {} };
  
  // Pattern match for :params
  for (const route of Object.keys(routes)) {
    if (!route.startsWith(method + ':')) continue;
    
    const pattern = route.substring(method.length + 1);
    const paramNames = [];
    const regexPattern = pattern.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    
    const match = pathname.match(new RegExp('^' + regexPattern + '$'));
    if (match) {
      const params = {};
      paramNames.forEach((name, i) => params[name] = match[i + 1]);
      return { handler: routes[route], params, query: {} };
    }
  }
  
  return null;
}

// Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  // Auth check for admin routes
  if (pathname.startsWith('/api/admin')) {
    if (!auth(req)) {
      return json(res, { error: 'Unauthorized' }, 401);
    }
  }

  // Parse body for POST/PUT
  let body = {};
  if (['POST', 'PUT'].includes(method)) {
    try {
      body = await parseBody(req);
    } catch (e) {
      return json(res, { error: 'Invalid JSON' }, 400);
    }
  }

  // Route matching
  const route = matchRoute(method, pathname);
  if (route) {
    return route.handler(req, res, route.params, parsedUrl.query, body);
  }

  // Static files
  const staticPath = path.join(__dirname, '..', 'public', pathname);
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const ext = path.extname(staticPath);
    const contentTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.ico': 'image/x-icon',
      '.png': 'image/png',
      '.jpg': 'image/jpeg'
    };
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
    return res.end(fs.readFileSync(staticPath));
  }

  // 404
  json(res, { error: 'Not found' }, 404);
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     WA Book Order - Local Server                           ║
╠════════════════════════════════════════════════════════════╣
║  Server:     http://localhost:${PORT}                        ║
║  Dashboard:  http://localhost:${PORT}/index.html              ║
║  API:        http://localhost:${PORT}/api/admin              ║
║  Admin Token: ${ADMIN_TOKEN.substring(0, 10)}...                        ║
╠════════════════════════════════════════════════════════════╣
║  WhatsApp:   Run 'cd server && npm install && npm start'   ║
╚════════════════════════════════════════════════════════════╝
  `);
});
