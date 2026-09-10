/**
 * webhookService.js
 * -----------------------------------------------------------------------
 * "System Monitor" — menerima webhook dari provider WhatsApp (mis. DripSender,
 * lihat PRD bagian 39) dan mendistribusikannya ke 3 jenis event
 * (PRD bagian 38.5 STEP 2):
 *   1. Book Publication  (message.type = "image_with_caption")
 *   2. Customer Reply    (message.type = "text", reply_to terisi)
 *   3. Admin Confirmation(message.type = "reaction", value ✅/❌/x)
 * -----------------------------------------------------------------------
 */

const { groups, books, posts } = require('../db/store');
const { parsePostText } = require('./postParser');
const orderService = require('./orderService');
const logger = require('../utils/logger');

const CONFIRM_REACTIONS = ['✅', '✔️', '✔'];
const REJECT_REACTIONS = ['❌', '✖️', '✖', 'x', 'X'];

function resolveGroup(payload) {
  const waGroupId = payload.group_id;
  let group = groups.findOne((g) => g.waGroupId === waGroupId);
  return group;
}

/** Cari buku existing berdasarkan judul (case-insensitive) atau buat baru. */
function findOrCreateBook(parsed) {
  if (!parsed.title) return null;
  const normalizedTitle = parsed.title.trim().toLowerCase();
  let book = books.findOne((b) => b.title.trim().toLowerCase() === normalizedTitle);

  if (book) {
    // update snapshot harga/stok terbaru jika ada info baru
    const patch = {};
    if (parsed.price) patch.nettPrice = parsed.price;
    if (parsed.stockFromNote != null) patch.stock = parsed.stockFromNote;
    if (Object.keys(patch).length) book = books.update(book.id, patch);
    return book;
  }

  return books.insert({
    title: parsed.title,
    publisher: null,
    prefix: parsed.prefix,
    isbn: null,
    price: parsed.price,
    nettPrice: parsed.price,
    image: null,
    previewUrl: parsed.previewUrl,
    description: parsed.additionalNote,
    stock: parsed.stockFromNote != null ? parsed.stockFromNote : 0,
    status: 'Active',
  });
}

function handleBookPublication(payload, group) {
  const caption = payload.message.caption || '';
  const parsed = parsePostText(caption);
  const book = findOrCreateBook(parsed);

  const post = posts.insert({
    waMessageId: payload.message.id,
    groupId: group.id,
    admin: payload.sender ? payload.sender.name : null,
    bookId: book ? book.id : null,
    postedAt: payload.message.timestamp || new Date().toISOString(),
    originalText: caption,
    image: payload.message.image_url || null,
    previewUrl: parsed.previewUrl,
    priceSnapshot: parsed.price,
    stockSnapshot: parsed.stockFromNote != null ? parsed.stockFromNote : book ? book.stock : null,
    additionalNote: parsed.additionalNote,
    retryAllowed: parsed.retryAllowed,
    status: 'Active',
  });

  logger.info(`[monitor] Book publication ditangkap: "${parsed.title}" @ ${group.code}`);
  return { type: 'BOOK_PUBLICATION', post, book };
}

function handleCustomerReply(payload, group) {
  const reply = orderService.receiveReply({
    waMessageId: payload.message.id,
    groupId: group.id,
    parentMessageId: payload.reply_to,
    customerName: payload.sender ? payload.sender.name : 'Unknown',
    customerPhone: payload.sender ? payload.sender.phone : '',
    replyText: payload.message.text || payload.message.caption || '',
    replyTimestamp: payload.message.timestamp,
  });

  logger.info(`[monitor] Customer reply ditangkap: "${reply.replyText}" -> ${reply.status}`);
  return { type: 'CUSTOMER_REPLY', reply };
}

function handleReaction(payload, group) {
  const value = payload.message.reaction || payload.message.text;
  const targetWaMessageId = payload.reply_to;
  const adminName = payload.sender ? payload.sender.name : 'admin';

  const { replies } = require('../db/store');
  const targetReply = replies.findOne((r) => r.waMessageId === targetWaMessageId && r.groupId === group.id);

  if (!targetReply) {
    logger.warn(`[monitor] Reaction "${value}" tidak menemukan reply target (waMessageId=${targetWaMessageId})`);
    return { type: 'REACTION_IGNORED', reason: 'target reply not found' };
  }

  if (CONFIRM_REACTIONS.includes(value)) {
    const updated = orderService.confirmReply(targetReply.id, { adminName });
    return { type: 'ADMIN_CONFIRMATION', decision: 'CONFIRMED', reply: updated };
  }

  if (REJECT_REACTIONS.includes(value)) {
    const updated = orderService.rejectReply(targetReply.id, { adminName, reason: 'Stock unavailable' });
    return { type: 'ADMIN_CONFIRMATION', decision: 'REJECTED', reply: updated };
  }

  logger.warn(`[monitor] Reaction tidak dikenali: "${value}"`);
  return { type: 'REACTION_IGNORED', reason: 'unrecognized reaction value' };
}

/**
 * Entry point utama. `payload` mengikuti bentuk webhook DripSender
 * (lihat PRD bagian 39.2), disederhanakan untuk kebutuhan project ini.
 */
function processWebhookEvent(payload) {
  if (!payload || !payload.message) {
    throw new Error('Payload webhook tidak valid: field "message" wajib ada');
  }

  const group = resolveGroup(payload);
  if (!group) {
    logger.warn(`[monitor] Group belum terdaftar/aktif: ${payload.group_id}. Event diabaikan.`);
    return { type: 'IGNORED', reason: 'group not registered or inactive' };
  }
  if (!group.active) {
    logger.warn(`[monitor] Group "${group.name}" tidak aktif dimonitor. Event diabaikan.`);
    return { type: 'IGNORED', reason: 'group not active' };
  }

  switch (payload.message.type) {
    case 'image_with_caption':
      return handleBookPublication(payload, group);
    case 'text':
      if (payload.reply_to) {
        return handleCustomerReply(payload, group);
      }
      return { type: 'IGNORED', reason: 'text message without reply_to (bukan reply order)' };
    case 'reaction':
      return handleReaction(payload, group);
    default:
      logger.warn(`[monitor] Tipe message tidak dikenali: ${payload.message.type}`);
      return { type: 'IGNORED', reason: 'unknown message type' };
  }
}

module.exports = { processWebhookEvent };
