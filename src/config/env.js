require('dotenv').config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  adminToken: process.env.ADMIN_TOKEN || 'change-this-admin-token',
  baileysAuthDir: process.env.BAILEYS_AUTH_DIR || './data/baileys_auth',
  autoConnectWhatsapp: (process.env.AUTO_CONNECT_WHATSAPP || 'true').toLowerCase() !== 'false',
  googleSheetId: process.env.GOOGLE_SHEET_ID || '',
  dataDir: process.env.DATA_DIR || './data',
};
