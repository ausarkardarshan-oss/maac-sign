'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { Notification, User } = require('../src/models');
const {
  listNotifications,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
} = require('../src/services/notificationService');

test('Notifications Service Functionality', async (t) => {
  await connectDB();
  const testUserId = 'test-notif-user-' + Date.now();

  await t.test('listNotifications auto-seeds welcome notification when empty', async () => {
    const list = await listNotifications(testUserId);
    assert.ok(list.length >= 1);
    assert.equal(list[0].type, 'system');
    assert.equal(list[0].title, 'Welcome to MAAC AI Sign');
  });

  await t.test('createNotification adds a new notification', async () => {
    const created = await createNotification(testUserId, {
      title: 'Contract Signed',
      message: 'NDA.pdf was completed by signer.',
      type: 'signing',
      link: '/documents',
    });

    assert.ok(created.id);
    assert.equal(created.title, 'Contract Signed');
    assert.equal(created.read, false);

    const list = await listNotifications(testUserId);
    const found = list.find((n) => n.id === created.id);
    assert.ok(found);
  });

  await t.test('markAsRead updates notification read status', async () => {
    const created = await createNotification(testUserId, {
      title: 'Unread Alert',
      message: 'Check this document.',
      type: 'document',
    });

    assert.equal(created.read, false);
    const updated = await markAsRead(testUserId, created.id);
    assert.equal(updated.ok, true);
    assert.equal(updated.read, true);
  });

  await t.test('markAllAsRead marks all user notifications as read', async () => {
    await markAllAsRead(testUserId);
    const list = await listNotifications(testUserId);
    assert.ok(list.every((n) => n.read === true));
  });

  await t.test('deleteNotification removes a single notification', async () => {
    const created = await createNotification(testUserId, {
      title: 'To Be Deleted',
      message: 'Delete me.',
      type: 'system',
    });

    await deleteNotification(testUserId, created.id);
    const list = await listNotifications(testUserId);
    assert.ok(!list.some((n) => n.id === created.id));
  });

  await t.test('clearAllNotifications empties all notifications for user', async () => {
    await clearAllNotifications(testUserId);
    const count = await Notification.countDocuments({ user_id: testUserId });
    assert.equal(count, 0);
  });

  // Cleanup
  await Notification.deleteMany({ user_id: testUserId });
  await mongoose.connection.close();
});
