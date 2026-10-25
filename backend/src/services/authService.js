'use strict';
const crypto = require('node:crypto');
const { User, Session } = require('../models');
const { uid, now, hash } = require('../utils/crypto');
const env = require('../config/env');

/**
 * Set a session cookie and insert a session record.
 */
async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hash(token);
  const expires = new Date(Date.now() + env.SESSION_MAX_AGE_MS);

  await Session.create({
    _id: tokenHash,
    user_id: userId,
    expires,
  });

  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: env.SESSION_MAX_AGE_MS,
    secure: env.COOKIE_SECURE,
  });

  return token;
}

/**
 * Look up the authenticated user from the session cookie.
 */
async function getSessionUser(req) {
  const token = req.cookies?.session;
  if (!token) return null;

  const tokenHash = hash(token);
  const session = await Session.findOne({
    _id: tokenHash,
    expires: { $gt: new Date() },
  });

  if (!session) return null;

  const user = await User.findById(session.user_id);
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    notification_preferences: user.notification_preferences || { email_on_complete: true, signer_reminders: true },
  };
}

/**
 * Register a new user.
 */
async function register({ email, name, password }) {
  const existing = await User.findOne({ email });
  if (existing) {
    const err = new Error('Email already registered');
    err.status = 409;
    throw err;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hashVal = crypto.scryptSync(password, salt, 64).toString('hex');
  const id = uid();

  const user = await User.create({
    _id: id,
    email,
    name,
    hash: hashVal,
    salt,
    created: now(),
  });

  return { id: user.id, email: user.email, name: user.name };
}

/**
 * Authenticate a user.
 */
async function login({ email, password }) {
  const user = await User.findOne({ email });
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const attempt = crypto.scryptSync(password, user.salt, 64);
  const stored = Buffer.from(user.hash, 'hex');

  if (attempt.length !== stored.length || !crypto.timingSafeEqual(attempt, stored)) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  return { id: user.id, email: user.email, name: user.name };
}

/**
 * Update user profile.
 */
async function updateProfile(userId, { name, email, notification_preferences }) {
  const update = {};
  if (name && typeof name === 'string' && name.trim().length > 0) {
    update.name = name.trim();
  }
  if (email && typeof email === 'string' && email.trim().length > 0) {
    const emailClean = email.trim().toLowerCase();
    const existing = await User.findOne({ email: emailClean, _id: { $ne: userId } });
    if (existing) {
      const err = new Error('Email already in use');
      err.status = 409;
      throw err;
    }
    update.email = emailClean;
  }
  if (notification_preferences && typeof notification_preferences === 'object') {
    update.notification_preferences = {
      email_on_complete: Boolean(notification_preferences.email_on_complete),
      signer_reminders: Boolean(notification_preferences.signer_reminders),
    };
  }

  const updated = await User.findByIdAndUpdate(userId, update, { new: true });
  return {
    id: updated.id,
    email: updated.email,
    name: updated.name,
    notification_preferences: updated.notification_preferences,
  };
}

/**
 * Delete a session.
 */
async function destroySession(req, res) {
  const token = req.cookies?.session;
  if (token) {
    await Session.deleteOne({ _id: hash(token) });
  }
  res.clearCookie('session');
}

module.exports = { createSession, getSessionUser, register, login, destroySession, updateProfile };
