/**
 * Customer Check via Application (PRD bagian 16)
 * Endpoint publik (tidak perlu admin token) untuk customer cek rekapan
 * dengan Group Code + Kode.
 */
const express = require('express');
const { getCustomerInvoice } = require('../../services/invoiceService');
const { OrderError } = require('../../services/orderService');

const router = express.Router();

// GET /api/customer/check?group=Group%206&code=7890
router.get('/', (req, res, next) => {
  const { group, code } = req.query;
  if (!group || !code) {
    return res.status(400).json({ error: 'Query "group" dan "code" wajib diisi' });
  }
  try {
    res.json(getCustomerInvoice(group, code));
  } catch (err) {
    if (err instanceof OrderError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
