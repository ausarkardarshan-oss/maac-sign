'use strict';
require('dotenv').config();

const env = {
  PORT: Number(process.env.PORT) || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  COOKIE_SECURE: process.env.COOKIE_SECURE === '1',
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://localhost:5173',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  SESSION_MAX_AGE_MS: Number(process.env.SESSION_MAX_AGE_MS) || 7 * 24 * 60 * 60 * 1000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/maac-sign',
  // Brevo SMTP
  SMTP_HOST: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'MAAC AI Sign <notifications@maacsign.com>',
  // Optional cryptographic digital signature settings
  SIGNING_CERT_PATH: process.env.SIGNING_CERT_PATH || '',
  SIGNING_KEY_PATH: process.env.SIGNING_KEY_PATH || '',
  SIGNING_PASSPHRASE: process.env.SIGNING_PASSPHRASE || '',
};

module.exports = env;
