/**
 * Web Admin — Invoice / Rekapan Tagihan (PRD bagian 16, 18)
 */
const express = require('express');
const { getCustomerInvoice } = require('../../services/invoiceService');
const { OrderError } = require('../../services/orderService');

const router = express.Router();

// GET /api/admin/invoices/:groupCode/:code
router.get('/:groupCode/:code', (req, res, next) => {
  try {
    res.json(getCustomerInvoice(req.params.groupCode, req.params.code));
  } catch (err) {
    if (err instanceof OrderError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
