/**
 * Web Admin — Incoming Replies & Decision (PRD bagian 20-21, 25)
 * Ini adalah "meja kerja" admin: lihat antrian reply, lalu confirm(✅)/
 * reject(❌)/retry (fix ulang).
 */
const express = require('express');
const orderService = require('../../services/orderService');
const { OrderError } = require('../../services/orderService');

const router = express.Router();

function handleServiceCall(fn, req, res, next) {
  try {
    const result = fn();
    res.json(result);
  } catch (err) {
    if (err instanceof OrderError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

// GET /api/admin/replies?status=WAITING_STOCK_CHECK&groupId=...
router.get('/', (req, res) => {
  const { status, groupId } = req.query;
  res.json(orderService.listIncomingReplies({ status, groupId }));
});

// POST /api/admin/replies  (admin input manual, tanpa lewat webhook)
router.post('/', (req, res, next) => {
  handleServiceCall(() => orderService.receiveReply(req.body), req, res, next);
});

// POST /api/admin/replies/:id/confirm  { adminName, quantity, priceOverride }
router.post('/:id/confirm', (req, res, next) => {
  handleServiceCall(
    () => orderService.confirmReply(req.params.id, req.body || {}),
    req,
    res,
    next
  );
});

// POST /api/admin/replies/:id/reject  { adminName, reason }
router.post('/:id/reject', (req, res, next) => {
  handleServiceCall(
    () => orderService.rejectReply(req.params.id, req.body || {}),
    req,
    res,
    next
  );
});

// POST /api/admin/replies/:id/retry  { adminName, quantity }  -- "fix ulang"
router.post('/:id/retry', (req, res, next) => {
  handleServiceCall(
    () => orderService.retryReply(req.params.id, req.body || {}),
    req,
    res,
    next
  );
});

module.exports = router;
