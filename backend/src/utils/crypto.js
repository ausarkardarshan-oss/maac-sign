'use strict';
const crypto = require('node:crypto');

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

/**
 * Hash a string value with SHA-256.
 * @param {string|Buffer} v
 */
const hash = (v) => sha256(v);

/**
 * Generate a cryptographically secure random token.
 * @param {number} bytes
 * @returns {string} hex token
 */
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

module.exports = { uid, now, hash, sha256, randomToken };
