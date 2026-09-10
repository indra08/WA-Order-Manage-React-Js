const express = require('express');
const { requireAdminToken } = require('../../middleware/auth');

const router = express.Router();

router.use(requireAdminToken);

router.use('/whatsapp', require('./whatsapp.routes'));
router.use('/groups', require('./groups.routes'));
router.use('/books', require('./books.routes'));
router.use('/posts', require('./posts.routes'));
router.use('/replies', require('./replies.routes'));
router.use('/invoices', require('./invoices.routes'));
router.use('/reports', require('./reports.routes'));

module.exports = router;
