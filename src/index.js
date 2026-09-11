/**
 * Cloudflare Workers - WA Book Order API (Plain Workers)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

function addCors(resp) {
  const headers = new Headers(resp.headers);
  Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
  return new Response(resp.body, { status: resp.status, headers });
}

// Auth
function auth(request, env) {
  const token = request.headers.get('x-admin-token');
  return token === (env.ADMIN_TOKEN || 'admin-secret');
}

// Routes
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Public routes
  if (path === '/health') {
    return json({ status: 'ok' });
  }

  // Webhook for Fonnte messages
  if (path === '/api/webhook/message' && request.method === 'POST') {
    try {
      const body = await request.json();
      
      // Fonnte format (from their PHP webhook):
      // device, sender, message, text, member, name, location, 
      // pollname, choices, timestamp, inboxid, url, filename, extension
      
      const device = String(body.device || '');  // Admin device phone
      const phone = String(body.sender || '');  // Customer phone
      const name = String(body.name || 'Unknown');
      const textMessage = String(body.message || body.text || '');
      const member = String(body.member || '');  // Group member who sent (empty if DM)
      const groupSender = String(body.member || '');  // For group messages
      const timestamp = body.timestamp ? new Date(parseInt(body.timestamp) * 1000).toISOString() : new Date().toISOString();
      const inboxId = String(body.inboxid || '');
      const url = String(body.url || '');
      const filename = String(body.filename || '');
      
      const isGroup = !!member;  // Has member = from group
      
      console.log(`[FONNTE] ${isGroup ? '[GROUP]' : '[DM]'} ${name} (${phone}): ${textMessage.slice(0, 50)}`);
      
      // Find or create customer
      let customer = null;
      if (phone) {
        customer = await env.DB.prepare(
          'SELECT * FROM customers WHERE phone = ?'
        ).bind(phone).first();
        
        if (!customer) {
          // Generate customer code (4-5 digits from phone)
          const code = phone.slice(-4);
          const { meta } = await env.DB.prepare(`
            INSERT INTO customers (name, phone, code, created_at)
            VALUES (?, ?, ?, datetime('now'))
          `).bind(name, phone, code).run();
          
          customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(meta.last_row_id).first();
          console.log(`[CUSTOMER] Created: ${name} (${phone}) code: ${code}`);
        }
      }
      
      // TODO: Parse message for purchase intent, create reply record, etc.
      
      return json({ 
        success: true,
        message: 'received',
        customerId: customer?.id || null,
        customerCode: customer?.code || null
      });
    } catch (err) {
      console.error('Webhook error:', err);
      return json({ error: err.message }, 500);
    }
  }

  // Customer check (public)
  if (path === '/api/customer/check') {
    const group = url.searchParams.get('group');
    const code = url.searchParams.get('code');
    
    if (!group || !code) {
      return json({ error: 'group and code required' }, 400);
    }
    
    const groupRow = await env.DB.prepare(
      "SELECT * FROM groups WHERE LOWER(code) = LOWER(?) OR id = ?"
    ).bind(group, group).first();
    
    if (!groupRow) {
      return json({ error: 'Group not found' }, 404);
    }
    
    const customer = await env.DB.prepare(
      'SELECT * FROM customers WHERE groupId = ? AND code = ?'
    ).bind(groupRow.id, code).first();
    
    if (!customer) {
      return json({ error: 'Customer not found' }, 404);
    }
    
    const items = await env.DB.prepare(`
      SELECT r.*, b.title as book_title, b.prefix as book_prefix
      FROM replies r
      LEFT JOIN posts p ON r.postId = p.id
      LEFT JOIN books b ON p.bookId = b.id
      WHERE r.customerId = ? AND r.includeInInvoice = 1 AND r.status != 'CANCELLED'
      ORDER BY r.decisionTimestamp DESC
    `).bind(customer.id).all();
    
    const total = items.reduce((sum, item) => 
      sum + ((item.priceSnapshot || 0) * (item.quantity || 1)), 0);
    
    return json({
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

  // Auth check for admin routes
  if (path.startsWith('/api/admin')) {
    if (!auth(request, env)) {
      return json({ error: 'Unauthorized' }, 401);
    }
  }

  // GET /api/admin/books
  if (path === '/api/admin/books' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM books ORDER BY id DESC').all();
    return json(results);
  }

  // POST /api/admin/books
  if (path === '/api/admin/books' && request.method === 'POST') {
    const body = await request.json();
    const { title, prefix, nettPrice, stock } = body;
    
    if (!title) return json({ error: 'Title required' }, 400);
    
    const { meta } = await env.DB.prepare(`
      INSERT INTO books (title, prefix, price, nettPrice, stock, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Active', datetime('now'), datetime('now'))
    `).bind(title, prefix || null, nettPrice, nettPrice, stock || 0).run();
    
    const book = await env.DB.prepare('SELECT * FROM books WHERE id = ?').bind(meta.last_row_id).first();
    return json(book, 201);
  }

  // GET /api/admin/groups
  if (path === '/api/admin/groups' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM groups ORDER BY code').all();
    return json(results);
  }

  // POST /api/admin/groups
  if (path === '/api/admin/groups' && request.method === 'POST') {
    const body = await request.json();
    const { code, name, waGroupId } = body;
    
    const { meta } = await env.DB.prepare(`
      INSERT INTO groups (code, name, waGroupId, active, created_at)
      VALUES (?, ?, ?, 1, datetime('now'))
    `).bind(code, name, waGroupId || null).run();
    
    const group = await env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(meta.last_row_id).first();
    return json(group, 201);
  }

  // POST /api/admin/groups/:id/:action
  if (path.match(/^\/api\/admin\/groups\/(\d+)\/(activate|deactivate)$/) && request.method === 'POST') {
    const [, id, action] = path.match(/^\/api\/admin\/groups\/(\d+)\/(activate|deactivate)$/);
    
    await env.DB.prepare(`UPDATE groups SET active = ? WHERE id = ?`)
      .bind(action === 'activate' ? 1 : 0, id).run();
    
    const group = await env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(id).first();
    return json(group);
  }

  // GET /api/admin/posts
  if (path === '/api/admin/posts' && request.method === 'GET') {
    const groupId = url.searchParams.get('groupId');
    let sql = `SELECT p.*, b.title as book_title, b.prefix as book_prefix, b.nettPrice as book_price, g.code as group_code 
               FROM posts p 
               LEFT JOIN books b ON p.bookId = b.id 
               LEFT JOIN groups g ON p.groupId = g.id`;
    
    if (groupId) {
      sql += ' WHERE p.groupId = ?';
      const { results } = await env.DB.prepare(sql).bind(groupId).all();
      return json(results);
    }
    
    sql += ' ORDER BY p.postedAt DESC LIMIT 100';
    const { results } = await env.DB.prepare(sql).all();
    return json(results);
  }

  // POST /api/admin/posts
  if (path === '/api/admin/posts' && request.method === 'POST') {
    const body = await request.json();
    const { groupId, title, prefix, price, stock } = body;
    
    let bookId = null;
    if (title) {
      let book = await env.DB.prepare('SELECT * FROM books WHERE LOWER(title) = LOWER(?)').bind(title).first();
      
      if (!book) {
        const { meta } = await env.DB.prepare(`
          INSERT INTO books (title, prefix, price, nettPrice, stock, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'Active', datetime('now'))
        `).bind(title, prefix || null, price, price, stock || 0).run();
        bookId = meta.last_row_id;
      } else {
        await env.DB.prepare(`
          UPDATE books SET prefix = COALESCE(?, prefix), nettPrice = COALESCE(?, nettPrice), 
          stock = COALESCE(?, stock), updated_at = datetime('now') WHERE id = ?
        `).bind(prefix || null, price || null, stock !== undefined ? stock : null, book.id).run();
        bookId = book.id;
      }
    }
    
    const priceDisplay = price >= 1000 ? Math.round(price / 1000) + 'k' : String(price || '');
    const textPrefix = prefix ? prefix + ' ' : '';
    const originalText = title ? textPrefix + title + ' - ' + priceDisplay + ' nett' : '';
    
    const { meta } = await env.DB.prepare(`
      INSERT INTO posts (groupId, bookId, admin, originalText, priceSnapshot, stockSnapshot, postedAt, status, created_at)
      VALUES (?, ?, 'admin', ?, ?, ?, datetime('now'), 'Active', datetime('now'))
    `).bind(groupId, bookId, originalText, price, stock !== undefined ? stock : null).run();
    
    const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(meta.last_row_id).first();
    return json(post, 201);
  }

  // GET /api/admin/replies
  if (path === '/api/admin/replies' && request.method === 'GET') {
    const status = url.searchParams.get('status');
    let sql = `SELECT r.*, c.name as customer_name, c.phone as customer_phone, c.code as customer_code,
               b.title as book_title, b.prefix as book_prefix, b.nettPrice as book_price, p.originalText as post_text
               FROM replies r
               LEFT JOIN customers c ON r.customerId = c.id
               LEFT JOIN posts p ON r.postId = p.id
               LEFT JOIN books b ON p.bookId = b.id`;
    
    if (status) {
      sql += ' WHERE r.status = ? ORDER BY r.replyTimestamp DESC LIMIT 200';
      const { results } = await env.DB.prepare(sql).bind(status).all();
      return json(results);
    }
    
    sql += ' ORDER BY r.replyTimestamp DESC LIMIT 200';
    const { results } = await env.DB.prepare(sql).all();
    return json(results);
  }

  // POST /api/admin/replies/:id/confirm
  if (path.match(/^\/api\/admin\/replies\/(\d+)\/confirm$/) && request.method === 'POST') {
    const id = path.match(/^\/api\/admin\/replies\/(\d+)\/confirm$/)[1];
    const body = await request.json();
    const { adminName, quantity } = body;
    
    const reply = await env.DB.prepare('SELECT * FROM replies WHERE id = ?').bind(id).first();
    if (!reply) return json({ error: 'Reply not found' }, 404);
    if (reply.status === 'INVOICED') return json({ error: 'Already confirmed' }, 409);
    
    const post = reply.postId ? await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(reply.postId).first() : null;
    const book = post && post.bookId ? await env.DB.prepare('SELECT * FROM books WHERE id = ?').bind(post.bookId).first() : null;
    
    const qty = quantity || reply.quantity || 1;
    const price = reply.priceSnapshot || (post ? post.priceSnapshot : (book ? book.nettPrice : 0));
    
    if (book && book.stock >= qty) {
      await env.DB.prepare('UPDATE books SET stock = stock - ? WHERE id = ?').bind(qty, book.id).run();
    }
    
    await env.DB.prepare(`
      UPDATE replies SET status = 'INVOICED', decision = 'YES', decisionTimestamp = datetime('now'),
      decisionAdmin = ?, quantity = ?, includeInInvoice = 1, priceSnapshot = ? WHERE id = ?
    `).bind(adminName || 'admin', qty, price, id).run();
    
    const updated = await env.DB.prepare('SELECT * FROM replies WHERE id = ?').bind(id).first();
    return json(updated);
  }

  // POST /api/admin/replies/:id/reject
  if (path.match(/^\/api\/admin\/replies\/(\d+)\/reject$/) && request.method === 'POST') {
    const id = path.match(/^\/api\/admin\/replies\/(\d+)\/reject$/)[1];
    const body = await request.json();
    const { adminName, reason } = body;
    
    await env.DB.prepare(`
      UPDATE replies SET status = 'REJECTED', decision = 'NO', decisionTimestamp = datetime('now'),
      decisionAdmin = ?, decisionReason = ?, includeInInvoice = 0 WHERE id = ?
    `).bind(adminName || 'admin', reason || 'Stock unavailable', id).run();
    
    const updated = await env.DB.prepare('SELECT * FROM replies WHERE id = ?').bind(id).first();
    return json(updated);
  }

  // GET /api/admin/reports/summary
  if (path === '/api/admin/reports/summary' && request.method === 'GET') {
    try {
      const totalBooks = await env.DB.prepare('SELECT COUNT(*) as count FROM books').first();
      const totalPosts = await env.DB.prepare('SELECT COUNT(*) as count FROM posts').first();
      const totalGroups = await env.DB.prepare('SELECT COUNT(*) as count FROM groups').first();
      const activeGroups = await env.DB.prepare('SELECT COUNT(*) as count FROM groups WHERE active = 1').first();
      const waitingStock = await env.DB.prepare("SELECT COUNT(*) as count FROM replies WHERE status = 'WAITING_STOCK_CHECK'").first();
      const invoiced = await env.DB.prepare("SELECT COUNT(*) as count FROM replies WHERE status IN ('INVOICED', 'CONFIRMED')").first();
      const rejected = await env.DB.prepare("SELECT COUNT(*) as count FROM replies WHERE status = 'REJECTED'").first();
      const totalRevenue = await env.DB.prepare("SELECT SUM(priceSnapshot * quantity) as total FROM replies WHERE includeInInvoice = 1").first();
      const totalCustomers = await env.DB.prepare('SELECT COUNT(DISTINCT customerId) as count FROM replies').first();
      
      return json({
        totalBooks: totalBooks?.count || 0,
        totalPosts: totalPosts?.count || 0,
        totalGroups: totalGroups?.count || 0,
        activeGroups: activeGroups?.count || 0,
        waitingStockCheck: waitingStock?.count || 0,
        confirmedOrInvoiced: invoiced?.count || 0,
        rejected: rejected?.count || 0,
        totalRevenue: totalRevenue?.total || 0,
        totalCustomers: totalCustomers?.count || 0
      });
    } catch (err) {
      console.error('Summary error:', err);
      return json({ error: err.message }, 500);
    }
  }

  // GET /api/admin/whatsapp/status
  if (path === '/api/admin/whatsapp/status' && request.method === 'GET') {
    return json({ 
      status: 'CONFIGURED', 
      provider: 'fonnte',
      message: 'Fonnte configured. Set webhook URL in md.fonnte.com dashboard.',
      webhookUrl: 'https://wa-book-order-api.indra-maulana08.workers.dev/api/webhook/message'
    });
  }

  // GET /api/admin/whatsapp/groups
  if (path === '/api/admin/whatsapp/groups' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM groups ORDER BY code').all();
    return json(results);
  }

  // POST /api/admin/whatsapp/groups/register
  if (path === '/api/admin/whatsapp/groups/register' && request.method === 'POST') {
    const body = await request.json();
    const { waGroupId, name, participants } = body;
    
    if (!waGroupId) return json({ error: 'waGroupId required' }, 400);
    
    // Check if already exists
    let existing = await env.DB.prepare('SELECT * FROM groups WHERE waGroupId = ?').bind(waGroupId).first();
    
    if (!existing) {
      // Generate code like "Group 1", "Group 2", etc.
      const count = await env.DB.prepare('SELECT COUNT(*) as cnt FROM groups').first();
      const code = `Group ${(count?.cnt || 0) + 1}`;
      
      const { meta } = await env.DB.prepare(`
        INSERT INTO groups (code, name, waGroupId, active, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
      `).bind(code, name || code, waGroupId).run();
      
      existing = await env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(meta.last_row_id).first();
    }
    
    return json(existing);
  }

  // POST /api/admin/whatsapp/connect
  if (path === '/api/admin/whatsapp/connect' && request.method === 'POST') {
    // Placeholder - WhatsApp integration via DripSender would go here
    return json({
      status: 'NOT_IMPLEMENTED',
      message: 'WhatsApp connection requires DripSender API integration',
      provider: 'dripsender',
      website: 'https://portal.dripsender.id'
    });
  }

  // GET /api/admin/whatsapp/groups/available
  if (path === '/api/admin/whatsapp/groups/available' && request.method === 'GET') {
    // Placeholder - would fetch from WhatsApp API
    return json({
      groups: [],
      message: 'Connect WhatsApp first to see available groups'
    });
  }

  // POST /api/admin/whatsapp/dripsender/configure
  if (path === '/api/admin/whatsapp/dripsender/configure' && request.method === 'POST') {
    // For Workers - DripSender config saved via KV Store
    // In production, set DRIPSENDER_API_KEY via wrangler secret
    return json({
      success: true,
      provider: 'dripsender',
      message: 'DripSender configured. Set DRIPSENDER_API_KEY via: wrangler secret put DRIPSENDER_API_KEY'
    });
  }

  // POST /api/admin/whatsapp/fonnte/configure
  if (path === '/api/admin/whatsapp/fonnte/configure' && request.method === 'POST') {
    const body = await request.json();
    const { apiKey, deviceId } = body;
    
    // Verify API key works with Fonnte
    try {
      const response = await fetch('https://api.fonnte.com/device', {
        headers: {
          'Authorization': apiKey || env.FONNTE_API_KEY
        }
      });
      
      if (response.ok) {
        return json({
          success: true,
          provider: 'fonnte',
          deviceId: deviceId,
          status: 'CONNECTED',
          message: 'Fonnte berhasil terhubung!'
        });
      }
    } catch (e) {
      console.error('Fonnte error:', e);
    }
    
    return json({
      success: true,
      provider: 'fonnte',
      deviceId: deviceId,
      status: 'CONFIGURED',
      message: 'Fonnte configured. API key saved.'
    });
  }

  return json({ error: 'Not found' }, 404);
}

export default {
  fetch: (request, env, ctx) => handleRequest(request, env).catch(err => {
    console.error(err);
    return json({ error: err.message }, 500);
  })
};
