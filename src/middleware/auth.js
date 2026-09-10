const env = require('../config/env');

/**
 * Auth sederhana untuk endpoint /api/admin/*.
 * Kirim header: x-admin-token: <ADMIN_TOKEN>
 */
function requireAdminToken(req, res, next) {
  const token = req.header('x-admin-token');
  if (!token || token !== env.adminToken) {
    return res.status(401).json({ error: 'Unauthorized: header x-admin-token tidak valid' });
  }
  next();
}

module.exports = { requireAdminToken };
