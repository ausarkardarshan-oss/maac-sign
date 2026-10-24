'use strict';
const { Notification, Document, Request, Template, Form } = require('../models');
const { uid, now } = require('../utils/crypto');

/**
 * List all notifications for a user.
 * If user has no notifications, automatically seed initial notifications
 * from the user's workspace documents, requests, and templates.
 */
async function listNotifications(userId) {
  let list = await Notification.find({ user_id: userId }).sort({ created: -1 }).limit(50);

  if (list.length === 0) {
    // Generate initial workspace notifications
    const docs = await Document.find({ owner_id: userId }).sort({ created: -1 }).limit(3);
    const requests = await Request.find({ owner_id: userId }).sort({ created: -1 }).limit(3);
    const templates = await Template.find({ owner_id: userId }).sort({ created: -1 }).limit(2);
    const forms = await Form.find({ owner_id: userId }).sort({ created: -1 }).limit(2);

    const initial = [];

    // System welcome
    initial.push({
      _id: uid(),
      user_id: userId,
      title: 'Welcome to MAAC AI Sign',
      message: 'Your cryptographic document signing platform is ready. Upload agreements and collect legally binding signatures.',
      type: 'system',
      link: '/dashboard',
      read: false,
      created: now(),
    });

    for (const d of docs) {
      initial.push({
        _id: uid(),
        user_id: userId,
        title: `Document: ${d.name}`,
        message: d.status === 'completed'
          ? `Document has been fully signed and audited.`
          : `Document uploaded and ready for signature requests.`,
        type: 'document',
        link: '/documents',
        read: d.status === 'completed',
        created: d.created || now(),
      });
    }

    for (const r of requests) {
      initial.push({
        _id: uid(),
        user_id: userId,
        title: 'Signature Request Active',
        message: `Signature requested for document ID ${r.document_id.slice(0, 8)}… with status: ${r.status}.`,
        type: 'request',
        link: '/requests',
        read: r.status === 'completed',
        created: r.created || now(),
      });
    }

    for (const t of templates) {
      initial.push({
        _id: uid(),
        user_id: userId,
        title: `Template Ready: ${t.name}`,
        message: 'Reusable agreement template is configured and ready to generate documents.',
        type: 'template',
        link: '/templates',
        read: true,
        created: t.created || now(),
      });
    }

    for (const f of forms) {
      initial.push({
        _id: uid(),
        user_id: userId,
        title: `SignForm Created: ${f.name}`,
        message: 'Shareable public sign form record is established.',
        type: 'signform',
        link: '/signforms',
        read: true,
        created: f.created || now(),
      });
    }

    if (initial.length > 0) {
      await Notification.insertMany(initial);
      list = await Notification.find({ user_id: userId }).sort({ created: -1 });
    }
  }

  return list.map((n) => ({
    id: n.id || n._id,
    title: n.title,
    message: n.message,
    type: n.type,
    link: n.link,
    read: Boolean(n.read),
    created: n.created,
  }));
}

/**
 * Create a new notification for a user.
 */
async function createNotification(userId, { title, message, type = 'document', link = '/documents' }) {
  if (!title || !message) {
    const err = new Error('Title and message are required');
    err.status = 400;
    throw err;
  }
  const notif = await Notification.create({
    _id: uid(),
    user_id: userId,
    title,
    message,
    type,
    link,
    read: false,
    created: now(),
  });
  return {
    id: notif.id || notif._id,
    title: notif.title,
    message: notif.message,
    type: notif.type,
    link: notif.link,
    read: notif.read,
    created: notif.created,
  };
}

/**
 * Mark a single notification as read.
 */
async function markAsRead(userId, notificationId) {
  const notif = await Notification.findOneAndUpdate(
    { $or: [{ _id: notificationId }, { id: notificationId }], user_id: userId },
    { read: true },
    { returnDocument: 'after' }
  );
  if (!notif) {
    const err = new Error('Notification not found');
    err.status = 404;
    throw err;
  }
  return { ok: true, id: notif.id || notif._id, read: true };
}

/**
 * Mark all notifications for a user as read.
 */
async function markAllAsRead(userId) {
  await Notification.updateMany({ user_id: userId }, { read: true });
  return { ok: true };
}

/**
 * Delete a single notification.
 */
async function deleteNotification(userId, notificationId) {
  const result = await Notification.findOneAndDelete({
    $or: [{ _id: notificationId }, { id: notificationId }],
    user_id: userId,
  });
  if (!result) {
    const err = new Error('Notification not found');
    err.status = 404;
    throw err;
  }
  return { ok: true };
}

/**
 * Clear all notifications for a user.
 */
async function clearAllNotifications(userId) {
  await Notification.deleteMany({ user_id: userId });
  return { ok: true };
}

module.exports = {
  listNotifications,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
};
