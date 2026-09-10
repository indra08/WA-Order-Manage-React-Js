/**
 * System Monitor — Webhook simulasi/testing (opsional)
 *
 * Sejak sistem terhubung langsung ke WhatsApp lewat Baileys
 * (lihat src/services/waService.js), endpoint ini TIDAK LAGI dipakai
 * untuk menerima pesan sungguhan dari provider pihak ketiga. Endpoint ini
 * dipertahankan hanya sebagai alat bantu development/QA -- untuk mensimulasikan
 * event "posting buku" / "reply customer" / "reaction ✅❌" tanpa perlu
 * WhatsApp yang benar-benar terhubung. Lihat contoh curl di README.md.
 *
 * Karena ini alat internal, endpoint dilindungi token admin yang sama
 * dengan endpoint /api/admin/*.
 */
const express = require('express');
const { requireAdminToken } = require('../../middleware/auth');
const { processWebhookEvent } = require('../../services/webhookService');

const router = express.Router();

router.post('/', requireAdminToken, (req, res, next) => {
  try {
    const result = processWebhookEvent(req.body);
    res.status(200).json({ received: true, result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
