'use strict';
const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/database');

let server;

async function start() {
  try {
    await connectDB();

    server = app.listen(env.PORT, '0.0.0.0', () => {
      console.log(`MAAC AI Sign API: http://localhost:${env.PORT}`);
      console.log(`Environment: ${env.NODE_ENV}`);
    });

    // Verify SMTP asynchronously in the background so API is ready immediately
    const { verifySmtpConnection } = require('./services/emailService');
    verifySmtpConnection()
      .then((smtpHealth) => {
        if (smtpHealth.connected) {
          console.log(`[BREVO SMTP] Ready & Verified (${smtpHealth.host}:${smtpHealth.port})`);
        } else if (smtpHealth.configured) {
          console.warn(`[BREVO SMTP WARNING] Credentials set but connection failed: ${smtpHealth.error}`);
        } else {
          console.log(`[BREVO SMTP INFO] Credentials not set in .env. Email delivery will run in simulation mode.`);
        }
      })
      .catch((err) => {
        console.warn(`[BREVO SMTP WARNING] ${err.message}`);
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
