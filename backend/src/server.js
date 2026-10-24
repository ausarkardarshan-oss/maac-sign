'use strict';
const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/database');

let server;

async function start() {
  try {
    await connectDB();
    const { verifySmtpConnection } = require('./services/emailService');
    const smtpHealth = await verifySmtpConnection();
    if (smtpHealth.connected) {
      console.log(`[BREVO SMTP] Ready & Verified (${smtpHealth.host}:${smtpHealth.port})`);
    } else if (smtpHealth.configured) {
      console.warn(`[BREVO SMTP WARNING] Credentials set but connection failed: ${smtpHealth.error}`);
    } else {
      console.log(`[BREVO SMTP INFO] Credentials not set in .env. Email delivery will run in simulation mode.`);
    }

    server = app.listen(env.PORT, () => {
      console.log(`MAAC AI Sign API: http://localhost:${env.PORT}`);
      console.log(`Environment: ${env.NODE_ENV}`);
    });
    return server;
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (server) server.close();
  await disconnectDB();
  process.exit(0);
});

start();

module.exports = { app, start };
