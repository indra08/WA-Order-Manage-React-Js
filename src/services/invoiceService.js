/**
 * invoiceService.js
 * -----------------------------------------------------------------------
 * Rekapan tagihan customer (PRD bagian 16 & 18): customer bisa cek rekapan
 * dengan Group Code + Kode (4-5 digit dari nomor HP).
 * -----------------------------------------------------------------------
 */

const { groups, customers, replies, posts, books } = require('../db/store');
const { OrderError } = require('./orderService');

function findGroupByCode(groupCode) {
  return groups.findOne(
    (g) => g.code.toLowerCase() === String(groupCode || '').toLowerCase() || g.id === groupCode
  );
}

/**
 * @param {string} groupCode - contoh "Group 6" atau group id
 * @param {string} code - kode 4-5 digit customer
 */
function getCustomerInvoice(groupCode, code) {
  const group = findGroupByCode(groupCode);
  if (!group) throw new OrderError('Group tidak ditemukan', 404);

  const customer = customers.findOne((c) => c.groupId === group.id && c.code === String(code));
  if (!customer) throw new OrderError('Customer dengan kode tersebut tidak ditemukan di group ini', 404);

  const customerReplies = replies.query(
    (r) => r.customerId === customer.id && r.includeInInvoice && r.status !== 'CANCELLED'
  );

  const items = customerReplies.map((r) => {
    const post = r.postId ? posts.find(r.postId) : null;
    const book = post ? books.find(post.bookId) : null;
    const price = r.priceSnapshot ?? (book ? book.nettPrice ?? book.price : 0) ?? 0;
    const subtotal = price * (r.quantity || 1);
    return {
      replyId: r.id,
      title: book ? book.title : '(buku tidak diketahui)',
      price,
      quantity: r.quantity || 1,
      subtotal,
      status: r.itemStatus || 'Invoiced',
      timestamp: r.decisionTimestamp || r.replyTimestamp,
    };
  });

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  return {
    customer: {
      name: customer.name,
      phone: customer.phone,
      code: customer.code,
    },
    group: { id: group.id, code: group.code, name: group.name },
    items,
    total,
  };
}

module.exports = { getCustomerInvoice, findGroupByCode };
