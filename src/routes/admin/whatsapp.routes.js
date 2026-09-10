/**
 * Web Admin — WhatsApp Connection (Baileys) & Register Group dari WA
 * (PRD bagian 38.5 STEP 1: Register Group -> Configure WA Integration ->
 * Select/Activate group yang akan dimonitor)
 */
const express = require('express');
const waService = require('../../services/waService');
const { groups } = require('../../db/store');

const router = express.Router();

// GET /api/admin/whatsapp/status
router.get('/status', async (req, res, next) => {
  try {
    res.json(await waService.getStatus());
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/whatsapp/connect  -> mulai/mengulang proses koneksi (munculkan QR baru)
router.post('/connect', async (req, res, next) => {
  try {
    waService.start().catch(() => {}); // jalan di background, status dipoll lewat /status
    res.json({ started: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/whatsapp/logout -> putuskan sesi, siap scan QR akun lain
router.post('/logout', async (req, res, next) => {
  try {
    await waService.logout();
    res.json({ loggedOut: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/whatsapp/groups -> daftar group WA nyata + status registrasi di sistem
router.get('/groups', async (req, res, next) => {
  try {
    const waGroups = await waService.listWhatsappGroups();
    const registered = groups.all();
    const merged = waGroups.map((g) => {
      const match = registered.find((r) => r.waGroupId === g.waGroupId);
      return {
        ...g,
        registered: Boolean(match),
        internalGroupId: match ? match.id : null,
        active: match ? match.active : false,
        code: match ? match.code : null,
      };
    });
    res.json(merged);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/admin/whatsapp/groups/register  { waGroupId, name, code }
// Mendaftarkan group WA nyata menjadi group yang dimonitor sistem, langsung aktif.
router.post('/groups/register', async (req, res) => {
  const { waGroupId, name, code } = req.body;
  if (!waGroupId || !name) {
    return res.status(400).json({ error: 'Field "waGroupId" dan "name" wajib diisi' });
  }

  const existing = groups.findOne((g) => g.waGroupId === waGroupId);
  if (existing) {
    const updated = groups.update(existing.id, { active: true, name });
    return res.json(updated);
  }

  const autoCode = code || `Group ${groups.count() + 1}`;
  const created = groups.insert({ code: autoCode, name, waGroupId, active: true });
  res.status(201).json(created);
});

module.exports = router;
