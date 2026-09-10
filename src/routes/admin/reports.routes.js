/**
 * Web Admin — Reporting (PRD bagian 27) & Dashboard Summary (PRD bagian 19)
 */
const express = require('express');
const { replies, posts, books, groups, customers } = require('../../db/store');

const router = express.Router();

function invoicedReplies() {
  return replies.query((r) => r.includeInInvoice);
}

function itemPrice(r) {
  const post = r.postId ? posts.find(r.postId) : null;
  const book = post ? books.find(post.bookId) : null;
  return r.priceSnapshot ?? (book ? book.nettPrice ?? book.price : 0) ?? 0;
}

// GET /api/admin/reports/summary  -> ringkasan dashboard
router.get('/summary', (req, res) => {
  const all = replies.all();
  const invoiced = invoicedReplies();
  const revenue = invoiced.reduce((sum, r) => sum + itemPrice(r) * (r.quantity || 1), 0);

  res.json({
    totalGroups: groups.count(),
    activeGroups: groups.count((g) => g.active),
    totalBooks: books.count(),
    totalPosts: posts.count(),
    totalReplies: all.length,
    waitingStockCheck: replies.count((r) => r.status === 'WAITING_STOCK_CHECK'),
    confirmedOrInvoiced: invoiced.length,
    rejected: replies.count((r) => r.status === 'REJECTED'),
    waitingRetry: replies.count((r) => r.status === 'WAITING_RETRY'),
    totalRevenue: revenue,
    totalCustomers: customers.count(),
  });
});

// GET /api/admin/reports/sales -> total penjualan per tanggal
router.get('/sales', (req, res) => {
  const invoiced = invoicedReplies();
  const byDate = {};
  invoiced.forEach((r) => {
    const date = (r.decisionTimestamp || r.replyTimestamp || '').slice(0, 10);
    if (!byDate[date]) byDate[date] = { date, orders: 0, revenue: 0 };
    byDate[date].orders += 1;
    byDate[date].revenue += itemPrice(r) * (r.quantity || 1);
  });
  res.json(Object.values(byDate).sort((a, b) => (a.date < b.date ? 1 : -1)));
});

// GET /api/admin/reports/products -> per buku: qty terjual & revenue
router.get('/products', (req, res) => {
  const invoiced = invoicedReplies();
  const byBook = {};
  invoiced.forEach((r) => {
    const post = r.postId ? posts.find(r.postId) : null;
    const book = post ? books.find(post.bookId) : null;
    const key = book ? book.id : 'unknown';
    if (!byBook[key]) {
      byBook[key] = { bookId: key, title: book ? book.title : 'Tidak diketahui', qtySold: 0, revenue: 0 };
    }
    byBook[key].qtySold += r.quantity || 1;
    byBook[key].revenue += itemPrice(r) * (r.quantity || 1);
  });
  res.json(Object.values(byBook).sort((a, b) => b.revenue - a.revenue));
});

// GET /api/admin/reports/groups -> per group
router.get('/groups', (req, res) => {
  const invoiced = invoicedReplies();
  const byGroup = {};
  groups.all().forEach((g) => {
    byGroup[g.id] = { groupId: g.id, code: g.code, name: g.name, orders: 0, revenue: 0 };
  });
  invoiced.forEach((r) => {
    if (!byGroup[r.groupId]) return;
    byGroup[r.groupId].orders += 1;
    byGroup[r.groupId].revenue += itemPrice(r) * (r.quantity || 1);
  });
  res.json(Object.values(byGroup));
});

// GET /api/admin/reports/customers -> per customer
router.get('/customers', (req, res) => {
  const invoiced = invoicedReplies();
  const byCustomer = {};
  invoiced.forEach((r) => {
    const c = customers.find(r.customerId);
    if (!c) return;
    if (!byCustomer[c.id]) {
      byCustomer[c.id] = { customerId: c.id, name: c.name, phone: c.phone, code: c.code, orders: 0, revenue: 0 };
    }
    byCustomer[c.id].orders += 1;
    byCustomer[c.id].revenue += itemPrice(r) * (r.quantity || 1);
  });
  res.json(Object.values(byCustomer).sort((a, b) => b.revenue - a.revenue));
});

module.exports = router;
