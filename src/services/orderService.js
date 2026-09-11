/**
 * orderService.js
 * -----------------------------------------------------------------------
 * Business logic inti sistem, merangkum PRD bagian 4-8, 12-15, 25-26:
 *  - Reply customer bukan otomatis order diterima
 *  - Lifecycle status reply (NEW -> WAITING_STOCK_CHECK -> CONFIRMED/REJECTED -> INVOICED)
 *  - Makna checklist ✅ / ❌
 *  - Fix ulang / retry order dengan histori yang tertelusuri
 *  - Stock management
 * -----------------------------------------------------------------------
 */

const { books, posts, customers, replies } = require('../db/store');
const { analyzeReply } = require('./intentDetector');
const { generateCode, normalizePhone } = require('../utils/kode');
const logger = require('../utils/logger');

class OrderError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Cari atau buat customer berdasarkan nomor HP + group, sekaligus assign kode. */
function findOrCreateCustomer({ name, phone, groupId }) {
  const normalized = normalizePhone(phone);
  let customer = customers.findOne((c) => c.groupId === groupId && normalizePhone(c.phone) === normalized);
  if (customer) {
    if (name && customer.name !== name) {
      customer = customers.update(customer.id, { name });
    }
    return customer;
  }

  const existingInGroup = customers.query((c) => c.groupId === groupId);
  const code = generateCode(phone, existingInGroup);

  customer = customers.insert({
    name: name || phone,
    phone: normalized,
    groupId,
    code,
  });

  // Jika kode 4 digit lama sekarang bentrok karena customer baru, upgrade dua-duanya ke 5 digit.
  const conflicting = existingInGroup.find(
    (c) => normalizePhone(c.phone).slice(-4) === normalized.slice(-4) && c.code.length === 4
  );
  if (conflicting) {
    customers.update(conflicting.id, { code: normalizePhone(conflicting.phone).slice(-5) });
  }

  return customer;
}

/**
 * Mencatat reply baru dari customer (PRD bagian 12).
 * Tidak langsung dianggap order diterima -- lihat prinsip bisnis 4.1.
 */
function receiveReply({
  waMessageId,
  groupId,
  parentMessageId,
  postId,
  customerName,
  customerPhone,
  replyText,
  replyTimestamp,
}) {
  // Cari post: 1) by postId, 2) by waMessageId, 3) fallback ke post terbaru di group (untuk manual posting)
  let post = null;
  if (postId) {
    post = posts.find(postId);
  }
  if (!post && parentMessageId) {
    post = posts.findOne((p) => p.waMessageId === parentMessageId);
  }
  // Fallback: ambil post terbaru di group ini (untuk manual posting tanpa WhatsApp)
  if (!post && groupId) {
    const groupPosts = posts.query((p) => p.groupId === groupId && p.status === 'Active');
    if (groupPosts.length > 0) {
      // Urutkan dari terbaru
      groupPosts.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
      post = groupPosts[0];
    }
  }
  
  const { intent, quantity } = analyzeReply(replyText);

  const customer = findOrCreateCustomer({ name: customerName, phone: customerPhone, groupId });

  const reply = replies.insert({
    waMessageId,
    customerId: customer.id,
    groupId,
    parentMessageId,
    postId: post ? post.id : null,
    replyText,
    replyTimestamp: replyTimestamp || new Date().toISOString(),
    parsedIntent: intent,
    quantity: quantity || 1,
    status: intent === 'PURCHASE_INTENT' ? 'WAITING_STOCK_CHECK' : 'NOT_ORDER',
    decision: null,
    decisionTimestamp: null,
    decisionAdmin: null,
    decisionReason: null,
    retryOfReplyId: null,
    includeInInvoice: false,
  });

  logger.info(`Reply diterima: "${replyText}" -> intent=${intent}, status=${reply.status}`);
  return reply;
}

function getReplyOrThrow(replyId) {
  const reply = replies.find(replyId);
  if (!reply) throw new OrderError('Reply tidak ditemukan', 404);
  return reply;
}

/**
 * Admin memberi tanda ✅ (PRD bagian 6): business confirmation, buku masuk
 * tagihan/rekapan. Stok buku otomatis berkurang sejumlah quantity.
 */
function confirmReply(replyId, { adminName, quantity, priceOverride } = {}) {
  const reply = getReplyOrThrow(replyId);
  if (reply.status === 'CONFIRMED' || reply.status === 'INVOICED') {
    throw new OrderError('Reply ini sudah dikonfirmasi sebelumnya', 409);
  }

  const post = reply.postId ? posts.find(reply.postId) : null;
  const book = post ? books.find(post.bookId) : null;
  const finalQuantity = quantity || reply.quantity || 1;

  if (book && typeof book.stock === 'number') {
    if (book.stock < finalQuantity) {
      throw new OrderError(
        `Stok tidak cukup. Tersedia ${book.stock}, diminta ${finalQuantity}. Gunakan reject atau confirm sebagian.`,
        409
      );
    }
    books.update(book.id, { stock: book.stock - finalQuantity });
  }

  const priceSnapshot = priceOverride ?? (post ? post.priceSnapshot : book ? book.nettPrice ?? book.price : null);

  const updated = replies.update(reply.id, {
    quantity: finalQuantity,
    status: 'INVOICED',
    decision: 'YES',
    decisionTimestamp: new Date().toISOString(),
    decisionAdmin: adminName || 'admin',
    decisionReason: null,
    includeInInvoice: true,
    priceSnapshot,
    itemStatus: 'Invoiced',
  });

  logger.info(`Reply ${replyId} CONFIRMED oleh ${adminName || 'admin'} (qty=${finalQuantity})`);
  return updated;
}

/**
 * Admin memberi tanda ❌ (PRD bagian 7 & 15): stok tidak tersedia, TIDAK
 * masuk tagihan. Customer masih bisa fix ulang lewat retryReply().
 */
function rejectReply(replyId, { adminName, reason } = {}) {
  const reply = getReplyOrThrow(replyId);

  const updated = replies.update(reply.id, {
    status: 'REJECTED',
    decision: 'NO',
    decisionTimestamp: new Date().toISOString(),
    decisionAdmin: adminName || 'admin',
    decisionReason: reason || 'Stock unavailable',
    includeInInvoice: false,
  });

  logger.info(`Reply ${replyId} REJECTED oleh ${adminName || 'admin'}: ${reason || 'Stock unavailable'}`);
  return updated;
}

/**
 * "Fix ulang" (PRD bagian 8 & 25): customer yang sebelumnya di-REJECT bisa
 * diberi kesempatan order ulang saat stok ditemukan. Reply baru dibuat dan
 * terhubung ke reply asal lewat retryOfReplyId, sehingga histori tetap
 * tertelusuri (bukan transaksi baru yang tidak berhubungan).
 */
function retryReply(replyId, { adminName, quantity } = {}) {
  const original = getReplyOrThrow(replyId);
  if (original.status !== 'REJECTED') {
    throw new OrderError('Fix ulang hanya berlaku untuk reply yang berstatus REJECTED', 409);
  }

  replies.update(original.id, { status: 'WAITING_RETRY' });

  const retryReplyRecord = replies.insert({
    waMessageId: null,
    customerId: original.customerId,
    groupId: original.groupId,
    parentMessageId: original.waMessageId,
    postId: original.postId,
    replyText: original.replyText,
    replyTimestamp: new Date().toISOString(),
    parsedIntent: 'PURCHASE_INTENT',
    quantity: quantity || original.quantity || 1,
    status: 'WAITING_STOCK_CHECK',
    decision: null,
    decisionTimestamp: null,
    decisionAdmin: adminName || 'admin',
    decisionReason: null,
    retryOfReplyId: original.id,
    includeInInvoice: false,
  });

  logger.info(`Fix ulang dibuat untuk reply ${replyId} -> reply baru ${retryReplyRecord.id}`);
  return retryReplyRecord;
}

/** Daftar reply masuk untuk antrian admin (PRD bagian 20-21). */
function listIncomingReplies({ status, groupId } = {}) {
  return replies
    .query((r) => (status ? r.status === status : true) && (groupId ? r.groupId === groupId : true))
    .sort((a, b) => new Date(b.replyTimestamp) - new Date(a.replyTimestamp))
    .map(enrichReply);
}

function enrichReply(reply) {
  const customer = customers.find(reply.customerId);
  const post = reply.postId ? posts.find(reply.postId) : null;
  const book = post ? books.find(post.bookId) : null;
  return {
    ...reply,
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone, code: customer.code } : null,
    book: book ? { id: book.id, title: book.title, prefix: book.prefix, price: book.nettPrice ?? book.price, stock: book.stock } : null,
    post: post ? { id: post.id, originalText: post.originalText, priceSnapshot: post.priceSnapshot } : null,
  };
}

module.exports = {
  OrderError,
  findOrCreateCustomer,
  receiveReply,
  confirmReply,
  rejectReply,
  retryReply,
  listIncomingReplies,
  enrichReply,
};
