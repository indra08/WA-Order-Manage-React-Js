/**
 * store.js
 * -----------------------------------------------------------------------
 * Inisialisasi koleksi data sesuai Product/Post/Reply/Group/Invoice data
 * model di PRD (bagian 10, 11, 12, 22). Disimpan di file SQLite
 * sungguhan (lihat src/lib/sqliteDb.js), bukan lagi file JSON.
 * -----------------------------------------------------------------------
 */

const path = require('path');
const { SqliteDb } = require('../lib/sqliteDb');
const env = require('../config/env');

const db = new SqliteDb(path.join(env.dataDir, 'app.db'));

module.exports = {
  db,
  groups: db.collection('groups'),
  books: db.collection('books'),
  posts: db.collection('posts'),
  customers: db.collection('customers'),
  replies: db.collection('replies'),
  monitoringLogs: db.collection('monitoring_logs'),
};
