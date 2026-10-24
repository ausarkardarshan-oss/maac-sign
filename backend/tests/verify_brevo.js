'use strict';
require('dotenv').config();
const emailService = require('../src/services/emailService');

async function testBrevo() {
  console.log('1. Testing Brevo SMTP connection verification...');
  const health = await emailService.verifySmtpConnection();
  console.log('Connection Health:', JSON.stringify(health, null, 2));

  if (!health.connected) {
    console.error('Failed to connect to Brevo SMTP:', health.error);
    process.exit(1);
  }

  console.log('2. Sending live test email to darshanausarkar@gmail.com...');
  const sendRes = await emailService.sendSigningInvitation({
    recipientEmail: 'darshanausarkar@gmail.com',
    recipientName: 'Darshan Ausarkar',
    senderName: 'MAAC AI Sign Security',
    documentName: 'MAAC AI Sign Brevo Integration Verification.pdf',
    subject: 'Your Brevo SMTP integration is now active and operational!',
    invitationUrl: 'http://localhost:5173/dashboard',
    expiresAt: new Date(Date.now() + 7 * 86400000),
  });

  console.log('3. Live Email Dispatch Result:', JSON.stringify(sendRes, null, 2));
  console.log('ALL VERIFICATIONS SUCCESSFUL!');
  process.exit(0);
}

testBrevo().catch((err) => {
  console.error('Verification script error:', err);
  process.exit(1);
});
