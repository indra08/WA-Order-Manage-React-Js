/**
 * waMessageMapper.js
 * -----------------------------------------------------------------------
 * Mengubah objek pesan mentah dari Baileys menjadi payload event yang
 * sama bentuknya dengan yang dipakai webhookService.processWebhookEvent()
 * (PRD bagian 39.2), supaya semua business logic (parsing posting, deteksi
 * intent, confirm/reject) tetap satu jalur baik pesan datang lewat Baileys
 * (real WhatsApp) maupun lewat simulasi manual (/api/monitor/webhook).
 * -----------------------------------------------------------------------
 */

function jidToPhone(jid) {
  if (!jid) return null;
  return jid.split('@')[0].split(':')[0];
}

function extractSender(msg, selfId) {
  const isFromMe = Boolean(msg.key.fromMe);
  const jid = isFromMe ? selfId : msg.key.participant || msg.key.remoteJid;
  const phone = jidToPhone(jid);
  const name = isFromMe ? 'Admin' : msg.pushName || phone || 'Unknown';
  return { name, phone };
}

function detectMessageType(message) {
  if (!message) return null;
  if (message.reactionMessage) return 'reaction';
  if (message.imageMessage) return 'image_with_caption';
  if (message.conversation || message.extendedTextMessage) return 'text';
  return null;
}

function extractText(message, type) {
  if (type === 'text') {
    return message.conversation || (message.extendedTextMessage && message.extendedTextMessage.text) || '';
  }
  if (type === 'image_with_caption') {
    return message.imageMessage.caption || '';
  }
  return '';
}

function extractReplyTo(message, type) {
  const ctx =
    (message.extendedTextMessage && message.extendedTextMessage.contextInfo) ||
    (message.imageMessage && message.imageMessage.contextInfo);
  return ctx && ctx.stanzaId ? ctx.stanzaId : null;
}

/**
 * @param {object} msg - satu item dari event `messages.upsert` Baileys
 * @param {string} selfId - id akun WhatsApp yang sedang login (sock.user.id)
 * @returns {object|null} payload ternormalisasi, atau null jika pesan diabaikan
 */
function mapBaileysMessage(msg, selfId) {
  const remoteJid = msg.key && msg.key.remoteJid;
  if (!remoteJid || !remoteJid.endsWith('@g.us')) return null; // hanya pesan group
  if (!msg.message) return null;

  const type = detectMessageType(msg.message);
  if (!type) return null;

  const sender = extractSender(msg, selfId);
  const timestamp = msg.messageTimestamp
    ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString();

  if (type === 'reaction') {
    const reactionValue = msg.message.reactionMessage.text;
    const targetId = msg.message.reactionMessage.key && msg.message.reactionMessage.key.id;
    if (!reactionValue || !targetId) return null; // reaction dihapus / tidak lengkap

    return {
      group_id: remoteJid,
      sender,
      message: {
        id: msg.key.id,
        type: 'reaction',
        reaction: reactionValue,
        timestamp,
      },
      reply_to: targetId,
    };
  }

  const text = extractText(msg.message, type);

  const payload = {
    group_id: remoteJid,
    sender,
    message: {
      id: msg.key.id,
      type,
      timestamp,
    },
  };

  if (type === 'image_with_caption') {
    payload.message.caption = text;
  } else {
    payload.message.text = text;
    const replyTo = extractReplyTo(msg.message, type);
    if (replyTo) payload.reply_to = replyTo;
  }

  return payload;
}

module.exports = { mapBaileysMessage, jidToPhone };
