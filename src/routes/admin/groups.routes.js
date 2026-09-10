/**
 * Web Admin — Group Management (PRD bagian 22, FR-032..FR-034)
 */
const express = require('express');
const { groups } = require('../../db/store');

const router = express.Router();

// GET /api/admin/groups
router.get('/', (req, res) => {
  res.json(groups.all());
});

// POST /api/admin/groups  { code, name, waGroupId }
router.post('/', (req, res) => {
  const { code, name, waGroupId } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: 'Field "code" dan "name" wajib diisi' });
  }
  const group = groups.insert({
    code,
    name,
    waGroupId: waGroupId || null,
    active: false,
  });
  res.status(201).json(group);
});

// PUT /api/admin/groups/:id
router.put('/:id', (req, res) => {
  const group = groups.find(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group tidak ditemukan' });
  const updated = groups.update(req.params.id, req.body);
  res.json(updated);
});

// POST /api/admin/groups/:id/activate
router.post('/:id/activate', (req, res) => {
  const group = groups.find(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group tidak ditemukan' });
  res.json(groups.update(req.params.id, { active: true }));
});

// POST /api/admin/groups/:id/deactivate
router.post('/:id/deactivate', (req, res) => {
  const group = groups.find(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group tidak ditemukan' });
  res.json(groups.update(req.params.id, { active: false }));
});

// DELETE /api/admin/groups/:id
router.delete('/:id', (req, res) => {
  const ok = groups.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Group tidak ditemukan' });
  res.status(204).end();
});

module.exports = router;
