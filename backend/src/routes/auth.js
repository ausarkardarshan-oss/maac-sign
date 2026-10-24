'use strict';
const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const { register, login, createSession, destroySession, getSessionUser, updateProfile } = require('../services/authService');
const { requireAuth } = require('../middleware/auth');

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// POST /api/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const emailClean = (typeof email === 'string' ? email : '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 12) {
      return res.status(400).json({ error: 'Password must be at least 12 characters' });
    }

    const user = await register({ name: name.trim(), email: emailClean, password });
    await createSession(res, user.id);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// POST /api/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const emailClean = (typeof req.body.email === 'string' ? req.body.email : '').trim().toLowerCase();
    const user = await login({ email: emailClean, password: req.body.password || '' });
    await createSession(res, user.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /api/logout
router.post('/logout', async (req, res, next) => {
  try {
    await destroySession(req, res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/me
router.get('/me', async (req, res, next) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/me
router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { name, email, notification_preferences } = req.body;
    const updated = await updateProfile(req.user.id, { name, email, notification_preferences });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
