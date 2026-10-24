'use strict';
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  listNotifications,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
} = require('../services/notificationService');

const router = Router();

router.use(requireAuth);

// GET /api/notifications
router.get('/', async (req, res, next) => {
  try {
    const list = await listNotifications(req.user.id);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications
router.post('/', async (req, res, next) => {
  try {
    const created = await createNotification(req.user.id, req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res, next) => {
  try {
    await markAllAsRead(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res, next) => {
  try {
    const result = await markAsRead(req.user.id, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notifications/all
router.delete('/all', async (req, res, next) => {
  try {
    await clearAllNotifications(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await deleteNotification(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
