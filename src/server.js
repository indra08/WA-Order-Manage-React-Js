/**
 * server.js
 * -----------------------------------------------------------------------
 * Entry point. Menyatukan "Web Admin" (Container 1 di PRD 38.2.A) dan
 * "System Monitor" (Container 2 di PRD 38.2.B) menjadi SATU project/proses
 * Node.js yang berjalan di SATU port, sesuai permintaan:
 *
 *   /api/admin/...     -> fitur Web Admin (kelola group, buku, replies, dsb)
 *   /api/monitor/...   -> fitur System Monitor (webhook, health, stats)
 *   /api/customer/...  -> endpoint publik customer check rekapan
 *   /                  -> dashboard admin (static SPA di folder /public)
 *
 * Jika di kemudian hari load semakin besar dan perlu di-scale terpisah,
 * struktur routes/services sudah modular sehingga tinggal dipecah menjadi
 * 2 proses lagi (lihat README.md bagian "Memisahkan Kembali Menjadi 2 Service").
 * -----------------------------------------------------------------------
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const env = require('./config/env');
const logger = require('./utils/logger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const waService = require('./services/waService');

const app = express();

app.use(cors());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Simpan rawBody untuk keperluan verifikasi signature webhook (HMAC).
app.use(
  express.json({
    limit: '5mb',
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf-8');
    },
  })
);

// Dashboard Web Admin (static SPA)
app.use('/', express.static(path.join(__dirname, '..', 'public')));

// API: Web Admin
app.use('/api/admin', require('./routes/admin'));

// API: System Monitor
app.use('/api/monitor', require('./routes/monitor'));

// API: Customer check (publik)
app.use('/api/customer', require('./routes/customer'));

// Root-level health check (memudahkan load balancer/orchestrator)
app.get('/health', (req, res) => res.json({ status: 'OK', service: 'wa-book-order-system' }));

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  logger.info(`WA Book Order System berjalan di http://localhost:${env.port}`);
  logger.info(`Dashboard Admin : http://localhost:${env.port}/`);
  logger.info(`Web Admin API   : http://localhost:${env.port}/api/admin`);
  logger.info(`System Monitor  : http://localhost:${env.port}/api/monitor`);
  logger.info(`Customer Check  : http://localhost:${env.port}/api/customer/check`);

  if (env.autoConnectWhatsapp) {
    logger.info('Menghubungkan ke WhatsApp (Baileys)... buka menu "WhatsApp Connection" di dashboard untuk scan QR.');
    waService.start().catch((err) => logger.error('Gagal memulai koneksi WhatsApp:', err.message));
  } else {
    logger.info('AUTO_CONNECT_WHATSAPP=false -> koneksi WhatsApp harus dimulai manual dari dashboard.');
  }
});
