const logger = require('../utils/logger');

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route tidak ditemukan: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) {
    logger.error(err);
  }
  res.status(status).json({ error: err.message || 'Internal Server Error' });
}

module.exports = { notFoundHandler, errorHandler };
