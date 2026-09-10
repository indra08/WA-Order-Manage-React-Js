/**
 * System Monitor — Health & Stats (PRD bagian 38.7, FR-043)
 */
const express = require('express');
const { groups, posts, replies } = require('../../db/store');
const waService = require('../../services/waService');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', service: 'system-monitor', timestamp: new Date().toISOString() });
});

router.get('/stats', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const wa = await waService.getStatus();
  res.json({
    whatsapp_status: wa.status,
    whatsapp_number: wa.waNumber,
    groups_active: groups.count((g) => g.active),
    messages_today:
      posts.count((p) => (p.postedAt || '').startsWith(today)) +
      replies.count((r) => (r.replyTimestamp || '').startsWith(today)),
    orders_confirmed: replies.count((r) => r.includeInInvoice),
    orders_rejected: replies.count((r) => r.status === 'REJECTED'),
  });
});

module.exports = router;
