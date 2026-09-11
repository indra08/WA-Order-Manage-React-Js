/**
 * Baileys WhatsApp Integration
 * Untuk development local - jalankan terpisah dari server utama
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret';

class WhatsAppBaileys {
  constructor() {
    this.sock = null;
    this.logger = console;
  }

  async start() {
    const authFolder = path.join(__dirname, '..', 'auth');
    if (!fs.existsSync(authFolder)) {
      fs.mkdirSync(authFolder, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    this.sock = makeWASocket({
      auth: state,
      logger: this.logger,
      printQRInTerminal: true,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Connection closed. Reconnecting:', shouldReconnect);
        if (shouldReconnect) {
          this.start();
        }
      } else if (connection === 'open') {
        console.log('WhatsApp connected!');
      }
    });

    // Handle incoming messages
    this.sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        await this.handleMessage(msg);
      }
    });
  }

  async handleMessage(msg) {
    if (!msg.message || msg.key.fromMe) return;

    const messageText = msg.message.conversation || 
                        msg.message.extendedTextMessage?.text || 
                        msg.message.imageMessage?.caption || '';

    // Skip empty messages
    if (!messageText.trim()) return;

    // Get group info
    const isGroup = msg.key.remoteJid?.endsWith('@g.us');
    const groupJid = isGroup ? msg.key.remoteJid : null;
    const senderJid = msg.key.remoteJid;

    // Get sender info
    const senderName = msg.pushName || 'Unknown';
    
    // Extract phone number
    const phone = senderJid?.replace('@s.whatsapp.net', '').replace('@g.us', '') || '';

    console.log(`[${isGroup ? 'GROUP' : 'DM'}] ${senderName} (${phone}): ${messageText.substring(0, 100)}`);

    // Forward to local server
    try {
      await axios.post(`${SERVER_URL}/api/webhook/message`, {
        waMessageId: msg.key.id,
        fromJid: msg.key.remoteJid,
        senderJid: senderJid,
        senderName: senderName,
        messageText: messageText,
        timestamp: new Date().toISOString(),
        isGroup: isGroup,
        groupJid: groupJid,
      }, {
        headers: {
          'x-admin-token': ADMIN_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
      console.log('Message forwarded to server');
    } catch (err) {
      console.error('Failed to forward message:', err.message);
    }
  }

  async sendMessage(jid, text) {
    if (this.sock) {
      await this.sock.sendMessage(jid, { text });
    }
  }

  async sendGroupMessage(groupJid, text) {
    return this.sendMessage(groupJid, text);
  }

  async reactToMessage(messageJid, key, emoji) {
    if (this.sock) {
      await this.sock.sendMessage(messageJid, {
        react: { text: emoji, key: key }
      });
    }
  }

  getConnectionInfo() {
    return {
      connected: !!this.sock,
      user: this.sock?.user ? {
        id: this.sock.user.id,
        name: this.sock.user.name,
      } : null
    };
  }
}

// CLI mode
if (require.main === module) {
  const wa = new WhatsAppBaileys();
  
  console.log('Starting Baileys WhatsApp client...');
  console.log(`Server URL: ${SERVER_URL}`);
  console.log('');
  
  wa.start().catch(console.error);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    if (wa.sock) {
      await wa.sock.logout();
    }
    process.exit(0);
  });
}

module.exports = WhatsAppBaileys;
