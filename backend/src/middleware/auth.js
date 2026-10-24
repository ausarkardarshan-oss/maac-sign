'use strict';
const { getSessionUser } = require('../services/authService');

/**
 * Require authentication. Attaches req.user.
 */
async function requireAuth(req, res, next) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please sign in to continue' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth };
