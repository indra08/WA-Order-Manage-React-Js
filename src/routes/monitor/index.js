const express = require('express');
const router = express.Router();

router.use('/webhook', require('./webhook.routes'));
router.use('/', require('./health.routes')); // -> /health, /stats

module.exports = router;
