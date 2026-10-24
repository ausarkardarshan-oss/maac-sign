'use strict';

/**
 * Centralized error handler for Express.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR] ${req.method} ${req.path} →`, err);
  } else if (status >= 500) {
    console.error('[ERROR]', err.message);
  }

  res.status(status).json({
    error: (process.env.NODE_ENV !== 'production' || status < 500) ? err.message : 'Internal server error',
  });
}

/**
 * Validate required string fields.
 */
function validateFields(body, fields) {
  for (const [key, label] of Object.entries(fields)) {
    const val = typeof body[key] === 'string' ? body[key].trim() : body[key];
    if (!val) {
      const err = new Error(`${label} is required`);
      err.status = 400;
      throw err;
    }
  }
}

module.exports = { errorHandler, validateFields };
