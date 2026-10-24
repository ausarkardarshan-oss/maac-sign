'use strict';
const nodemailer = require('nodemailer');
const env = require('../config/env');

let cachedTransporter = null;

/**
 * Mask an email address for safe logging (e.g., d***n@domain.com)
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'unknown';
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const maskedUser = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : '***';
  return `${maskedUser}@${domain}`;
}

/**
 * Sanitize error message to prevent accidental credential leakage
 */
function sanitizeError(err) {
  if (!err) return 'Unknown email error';
  let msg = err.message || String(err);
  if (env.SMTP_PASS) {
    msg = msg.split(env.SMTP_PASS).join('[REDACTED_PASS]');
  }
  if (env.SMTP_USER) {
    msg = msg.split(env.SMTP_USER).join('[REDACTED_USER]');
  }
  return msg;
}

/**
 * Check if SMTP is configured
 */
function isConfigured() {
  return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

/**
 * Get or initialize Nodemailer transporter configured for Brevo SMTP (Port 587 STARTTLS)
 */
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  if (!isConfigured()) {
    return null;
  }

  const port = Number(env.SMTP_PORT) || 587;
  const isSecure = port === 465;

  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp-relay.brevo.com',
    port,
    secure: isSecure, // false for 587 STARTTLS
    requireTLS: !isSecure, // enforce STARTTLS for 587
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: env.NODE_ENV === 'production',
    },
    logger: false,
    debug: false,
  });

  return cachedTransporter;
}

/**
 * Verify SMTP connection (health check / startup probe)
 */
async function verifySmtpConnection() {
  if (!isConfigured()) {
    return {
      configured: false,
      connected: false,
      message: 'SMTP credentials not configured. Transactional emails will be simulated or stored in audit logs.',
    };
  }

  try {
    const transporter = getTransporter();
    await transporter.verify();
    return {
      configured: true,
      connected: true,
      host: env.SMTP_HOST || 'smtp-relay.brevo.com',
      port: Number(env.SMTP_PORT) || 587,
      from: env.SMTP_FROM,
      message: 'Brevo SMTP connection verified successfully',
    };
  } catch (err) {
    const safeMsg = sanitizeError(err);
    console.error(`[BREVO SMTP ERROR] Connection verification failed: ${safeMsg}`);
    return {
      configured: true,
      connected: false,
      host: env.SMTP_HOST || 'smtp-relay.brevo.com',
      port: Number(env.SMTP_PORT) || 587,
      error: safeMsg,
    };
  }
}

/**
 * Shared HTML email layout matching the MAAC AI Sign brand
 */
function buildEmailTemplate({ title, preheader, bodyHtml, actionText, actionUrl, footnoteHtml }) {
  const brandGreen = '#14866c';
  const brandDark = '#172a2a';
  const brandLight = '#55d4ad';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f7f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #192b32; }
    .wrapper { width: 100%; max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e5ece9; }
    .header { background: ${brandDark}; padding: 26px 32px; text-align: left; }
    .brandmark { display: inline-block; background: #24aa86; color: #ffffff; border-radius: 8px; font-weight: 800; font-size: 16px; padding: 4px 9px; margin-right: 8px; }
    .brandtitle { color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; vertical-align: middle; }
    .brandlight { color: ${brandLight}; }
    .content { padding: 36px 32px; }
    .heading { font-size: 22px; font-weight: 700; color: #172a2a; margin-top: 0; margin-bottom: 14px; letter-spacing: -0.4px; }
    .lead { font-size: 15px; line-height: 1.6; color: #4a5d57; margin-bottom: 24px; }
    .card { background-color: #f7faf9; border: 1px solid #e1ebe7; border-radius: 10px; padding: 18px 20px; margin: 20px 0; }
    .card-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
    .card-label { color: #72847f; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
    .card-val { color: #172a2a; font-weight: 700; text-align: right; }
    .btn-wrap { text-align: center; margin: 32px 0 24px; }
    .btn { display: inline-block; background-color: ${brandGreen}; color: #ffffff !important; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 34px; border-radius: 10px; letter-spacing: -0.2px; }
    .alt-link { font-size: 12px; color: #849690; word-break: break-all; line-height: 1.5; margin-top: 18px; }
    .footer { background-color: #f9fbfa; padding: 22px 32px; border-top: 1px solid #e8eeec; font-size: 12px; color: #8a9c97; line-height: 1.6; }
    .footer strong { color: #4a5d57; }
  </style>
</head>
<body>
  ${preheader ? `<span style="display:none;font-size:0px;line-height:0px;max-height:0px;mso-hide:all;">${preheader}</span>` : ''}
  <div class="wrapper">
    <div class="header">
      <span class="brandmark">✦</span>
      <span class="brandtitle">maac<span class="brandlight">sign</span></span>
    </div>
    <div class="content">
      <h1 class="heading">${title}</h1>
      ${bodyHtml}
      ${actionUrl && actionText ? `
      <div class="btn-wrap">
        <a href="${actionUrl}" class="btn" target="_blank" rel="noopener noreferrer">${actionText}</a>
      </div>
      <div class="alt-link">
        If the button does not work, copy and paste this link in your browser:<br/>
        <a href="${actionUrl}" style="color:${brandGreen};">${actionUrl}</a>
      </div>
      ` : ''}
    </div>
    <div class="footer">
      ${footnoteHtml || `
      <p style="margin:0 0 6px;"><strong>MAAC AI Sign Security Notice</strong>: This is a secure transaction notification. Do not forward this link to unauthorized individuals.</p>
      <p style="margin:0;">Delivered securely via Brevo SMTP • Compliant with ESIGN & UETA electronic signature frameworks.</p>
      `}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generic mail sender wrapper with error catching and sanitized logging
 */
async function sendMail({ to, subject, html, text }) {
  const transporter = getTransporter();
  const masked = maskEmail(to);

  if (!transporter) {
    console.warn(`[BREVO SMTP] Credentials not configured. Simulating email delivery to ${masked}: "${subject}"`);
    return {
      success: false,
      simulated: true,
      messageId: `sim_${Date.now()}`,
      to: masked,
      subject,
      note: 'SMTP_USER or SMTP_PASS missing in backend/.env',
    };
  }

  try {
    console.log(`[BREVO SMTP] Sending email to ${masked}: "${subject}"...`);
    const info = await transporter.sendMail({
      from: env.SMTP_FROM || '"MAAC AI Sign" <notifications@maacsign.com>',
      to,
      subject,
      text,
      html,
    });

    console.log(`[BREVO SMTP] Successfully delivered email to ${masked}. Message ID: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      response: info.response,
    };
  } catch (err) {
    const safeError = sanitizeError(err);
    console.error(`[BREVO SMTP ERROR] Failed to send email to ${masked}: ${safeError}`);
    const wrappedErr = new Error(`Email delivery failed: ${safeError}`);
    wrappedErr.original = safeError;
    throw wrappedErr;
  }
}

/**
 * 1. Signing Invitation Email
 */
async function sendSigningInvitation({ recipientEmail, recipientName, senderName, documentName, subject, invitationUrl, expiresAt }) {
  const expiryText = expiresAt ? new Date(expiresAt).toUTCString() : '7 days from receipt';
  const title = `Signature Requested: ${documentName}`;

  const bodyHtml = `
    <p class="lead">Hello <strong>${recipientName || 'there'}</strong>,</p>
    <p class="lead"><strong>${senderName || 'A colleague'}</strong> has requested your electronic signature on <strong>${documentName}</strong> via MAAC AI Sign.</p>
    ${subject ? `<div style="font-style:italic;color:#35504b;padding:12px 16px;background:#f0f8f5;border-left:3px solid #24aa86;border-radius:4px;margin-bottom:20px;">"${subject}"</div>` : ''}
    <div class="card">
      <div class="card-row"><span class="card-label">Document</span><span class="card-val">${documentName}</span></div>
      <div class="card-row"><span class="card-label">Sender</span><span class="card-val">${senderName || 'MAAC Sign Workspace'}</span></div>
      <div class="card-row"><span class="card-label">Expiration</span><span class="card-val">${expiryText}</span></div>
    </div>
    <p style="font-size:14px;color:#4a5d57;line-height:1.5;">Click below to review the document and apply your legally binding electronic signature.</p>
  `;

  const text = `Hello ${recipientName || 'there'},

${senderName || 'A colleague'} has requested your electronic signature on "${documentName}" via MAAC AI Sign.
${subject ? `Message: "${subject}"\n` : ''}
Expiration: ${expiryText}

Review and sign the document here:
${invitationUrl}

This link is private and unique to you. Do not share it with others.
Compliant with ESIGN & UETA electronic signature frameworks.`;

  return sendMail({
    to: recipientEmail,
    subject: `Review & Sign: ${documentName}`,
    html: buildEmailTemplate({
      title,
      preheader: `${senderName || 'Someone'} requested your signature on ${documentName}`,
      bodyHtml,
      actionText: 'Review and Sign Document',
      actionUrl: invitationUrl,
    }),
    text,
  });
}

/**
 * 2. Signing Request Cancellation Email
 */
async function sendCancellationNotification({ recipientEmail, recipientName, senderName, documentName, reason }) {
  const title = `Signature Request Cancelled: ${documentName}`;

  const bodyHtml = `
    <p class="lead">Hello <strong>${recipientName || 'there'}</strong>,</p>
    <p class="lead">Please be advised that <strong>${senderName || 'The sender'}</strong> has cancelled the signature request for <strong>${documentName}</strong>.</p>
    ${reason ? `<div class="card"><div class="card-label">Reason for cancellation</div><div style="font-size:14px;color:#172a2a;margin-top:6px;">${reason}</div></div>` : ''}
    <p style="font-size:14px;color:#4a5d57;">The previous signing link is now void and no further action is required on your part.</p>
  `;

  const text = `Hello ${recipientName || 'there'},

The signature request for "${documentName}" from ${senderName || 'the sender'} has been cancelled.
${reason ? `Reason: ${reason}\n` : ''}
The signing link is now void. No further action is required.`;

  return sendMail({
    to: recipientEmail,
    subject: `Cancelled: Signature Request for ${documentName}`,
    html: buildEmailTemplate({
      title,
      preheader: `Signature request for ${documentName} was cancelled`,
      bodyHtml,
    }),
    text,
  });
}

/**
 * 3. Signing Reminder Email
 */
async function sendSigningReminder({ recipientEmail, recipientName, senderName, documentName, invitationUrl, expiresAt }) {
  const expiryText = expiresAt ? new Date(expiresAt).toUTCString() : 'shortly';
  const title = `Reminder: Please sign ${documentName}`;

  const bodyHtml = `
    <p class="lead">Hello <strong>${recipientName || 'there'}</strong>,</p>
    <p class="lead">This is a friendly reminder that <strong>${senderName || 'The sender'}</strong> is waiting for your signature on <strong>${documentName}</strong>.</p>
    <div class="card">
      <div class="card-row"><span class="card-label">Document</span><span class="card-val">${documentName}</span></div>
      <div class="card-row"><span class="card-label">Link Expiration</span><span class="card-val">${expiryText}</span></div>
    </div>
    <p style="font-size:14px;color:#4a5d57;">Please take a moment to review and sign the agreement to finalize the workflow.</p>
  `;

  const text = `Hello ${recipientName || 'there'},

This is a reminder that ${senderName || 'the sender'} is waiting for your signature on "${documentName}".
Expires: ${expiryText}

Review and sign here:
${invitationUrl}`;

  return sendMail({
    to: recipientEmail,
    subject: `Reminder: Please sign ${documentName}`,
    html: buildEmailTemplate({
      title,
      preheader: `Reminder to sign ${documentName}`,
      bodyHtml,
      actionText: 'Complete Your Signature',
      actionUrl: invitationUrl,
    }),
    text,
  });
}

/**
 * 4. Document Signing Completion Notification (Final Signed PDF)
 */
async function sendCompletionNotification({ recipientEmail, recipientName, documentName, downloadUrl, certificateUrl, isSender }) {
  const title = `Document Fully Executed: ${documentName}`;

  const bodyHtml = `
    <p class="lead">Hello <strong>${recipientName || 'there'}</strong>,</p>
    <p class="lead">All required parties have completed signing <strong>${documentName}</strong>.</p>
    <div class="card">
      <div class="card-row"><span class="card-label">Document</span><span class="card-val">${documentName}</span></div>
      <div class="card-row"><span class="card-label">Status</span><span class="card-val" style="color:#12855c;">✓ Completed & Sealed</span></div>
      <div class="card-row"><span class="card-label">Role</span><span class="card-val">${isSender ? 'Document Owner' : 'Signer'}</span></div>
    </div>
    <p style="font-size:14px;color:#4a5d57;">The finalized PDF containing the stamped signatures and cryptographic tamper-evident seal is ready for download.</p>
    ${certificateUrl ? `<p style="font-size:13px;color:#4a5d57;">You can also access the official <strong>Certificate of Completion</strong> detailing the full audit trail and SHA-256 integrity hashes.</p>` : ''}
  `;

  const text = `Hello ${recipientName || 'there'},

All required parties have signed "${documentName}". The document is now complete.
Download the finalized PDF:
${downloadUrl}

${certificateUrl ? `Download Certificate of Completion:\n${certificateUrl}\n` : ''}
Thank you for using MAAC AI Sign.`;

  return sendMail({
    to: recipientEmail,
    subject: `Completed: ${documentName}`,
    html: buildEmailTemplate({
      title,
      preheader: `${documentName} has been fully signed and executed`,
      bodyHtml,
      actionText: 'Download Final Signed PDF',
      actionUrl: downloadUrl,
    }),
    text,
  });
}

/**
 * 5. Certificate of Completion Notification
 */
async function sendCertificateNotification({ recipientEmail, recipientName, documentName, certificateId, certificateUrl }) {
  const title = `Certificate of Completion Ready`;

  const bodyHtml = `
    <p class="lead">Hello <strong>${recipientName || 'there'}</strong>,</p>
    <p class="lead">The official <strong>Certificate of Completion</strong> for <strong>${documentName}</strong> has been generated and sealed in the cryptographic audit register.</p>
    <div class="card">
      <div class="card-row"><span class="card-label">Document</span><span class="card-val">${documentName}</span></div>
      <div class="card-row"><span class="card-label">Certificate ID</span><span class="card-val" style="font-family:monospace;">${certificateId}</span></div>
      <div class="card-row"><span class="card-label">Timestamp</span><span class="card-val">${new Date().toUTCString()}</span></div>
    </div>
    <p style="font-size:14px;color:#4a5d57;">This certificate includes the cryptographic checksums (SHA-256) of both the original and signed files, timestamps, signer IP addresses, and consent logs.</p>
  `;

  const text = `Hello ${recipientName || 'there'},

The Certificate of Completion for "${documentName}" is available.
Certificate ID: ${certificateId}
Download: ${certificateUrl}

Generated by MAAC AI Sign.`;

  return sendMail({
    to: recipientEmail,
    subject: `Certificate of Completion: ${documentName}`,
    html: buildEmailTemplate({
      title,
      preheader: `Official Certificate of Completion for ${documentName}`,
      bodyHtml,
      actionText: 'Download Certificate (PDF)',
      actionUrl: certificateUrl,
    }),
    text,
  });
}

module.exports = {
  isConfigured,
  verifySmtpConnection,
  sendMail,
  sendSigningInvitation,
  sendCancellationNotification,
  sendSigningReminder,
  sendCompletionNotification,
  sendCertificateNotification,
  maskEmail,
};
