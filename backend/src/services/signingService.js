'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Request, Recipient, Document, User, Certificate, Audit } = require('../models');
const { STORAGE_DIR } = require('../config/database');
const { uid, now, hash, randomToken } = require('../utils/crypto');
const { appendAudit, getAuditTrail } = require('./auditService');
const emailService = require('./emailService');
const pdfService = require('./pdfService');
const digitalSignatureService = require('./digitalSignatureService');
const env = require('../config/env');

/**
 * PHASE 3: Create a signing request for a document and deliver invitation via Brevo SMTP.
 */
async function createSigningRequest({ userId, documentId, recipientEmail, recipientName, subject }) {
  const doc = await Document.findOne({ _id: documentId, owner_id: userId });
  if (!doc) {
    const err = new Error('Document not found or not owned by you');
    err.status = 404;
    throw err;
  }
  if (doc.status !== 'draft') {
    const err = new Error('Only draft documents can be sent for signing');
    err.status = 409;
    throw err;
  }

  const sender = await User.findById(userId);
  const senderName = sender ? sender.name : 'Document Owner';

  const requestId = uid();
  const recipientId = uid();
  const token = randomToken(32);
  const tokenHash = hash(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day token expiration

  await Request.create({
    _id: requestId,
    document_id: documentId,
    owner_id: userId,
    subject,
    status: 'pending',
    created: now(),
  });

  await Recipient.create({
    _id: recipientId,
    request_id: requestId,
    email: recipientEmail,
    name: recipientName,
    token_hash: tokenHash,
    status: 'pending',
    expires_at: expiresAt,
  });

  doc.status = 'in_progress';
  doc.updated = now();
  await doc.save();

  await appendAudit(documentId, userId, 'request_created', {
    request: requestId,
    recipient: recipientEmail,
    expires_at: expiresAt.toISOString(),
  });

  const invitationUrl = `${env.FRONTEND_URL}/sign/${token}`;

  // Deliver real email via Brevo SMTP
  let emailSent = false;
  let emailError = null;
  let messageId = null;

  try {
    const result = await emailService.sendSigningInvitation({
      recipientEmail,
      recipientName,
      senderName,
      documentName: doc.name,
      subject,
      invitationUrl,
      expiresAt,
    });
    emailSent = result.success !== false;
    messageId = result.messageId || null;

    await appendAudit(documentId, 'system', 'invitation_email_sent', {
      recipient: recipientEmail,
      message_id: messageId,
      simulated: result.simulated || false,
    });
  } catch (err) {
    emailSent = false;
    emailError = err.message || 'SMTP delivery failed';
    console.warn(`[SIGNING REQUEST] Email delivery failed for ${emailService.maskEmail(recipientEmail)}: ${emailError}`);

    await appendAudit(documentId, 'system', 'invitation_email_failed', {
      recipient: recipientEmail,
      error: emailError,
    });
  }

  return {
    id: requestId,
    status: 'pending',
    invitation: invitationUrl,
    token,
    emailSent,
    emailError,
    messageId,
  };
}

/**
 * Resend a signing invitation email (with rate-limiting/reminder tracking).
 */
async function resendSigningInvitation({ userId, requestId }) {
  const req = await Request.findOne({ _id: requestId, owner_id: userId });
  if (!req) {
    const err = new Error('Signing request not found');
    err.status = 404;
    throw err;
  }

  if (req.status !== 'pending') {
    const err = new Error('Can only send reminders for pending signature requests');
    err.status = 400;
    throw err;
  }

  const recipient = await Recipient.findOne({ request_id: requestId, status: 'pending' });
  if (!recipient) {
    const err = new Error('No pending recipient found for this request');
    err.status = 404;
    throw err;
  }

  // Check rate limit: minimum 5 minutes between reminders
  if (recipient.last_reminder_sent && (Date.now() - new Date(recipient.last_reminder_sent).getTime() < 5 * 60 * 1000)) {
    const err = new Error('A reminder was sent recently. Please wait 5 minutes before resending.');
    err.status = 429;
    throw err;
  }

  const doc = await Document.findById(req.document_id);
  const sender = await User.findById(userId);

  // Generate fresh token if expired
  let token;
  const isExpired = recipient.expires_at && new Date() > new Date(recipient.expires_at);
  if (isExpired) {
    token = randomToken(32);
    recipient.token_hash = hash(token);
    recipient.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  recipient.last_reminder_sent = new Date();
  await recipient.save();

  const invitationUrl = token
    ? `${env.FRONTEND_URL}/sign/${token}`
    : `${env.FRONTEND_URL}/requests`; // fallback URL

  let emailSent = false;
  try {
    await emailService.sendSigningReminder({
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      senderName: sender?.name || 'Sender',
      documentName: doc?.name || 'Document',
      invitationUrl,
      expiresAt: recipient.expires_at,
    });
    emailSent = true;

    await appendAudit(req.document_id, userId, 'reminder_email_sent', {
      recipient: recipient.email,
    });
  } catch (err) {
    console.error(`[REMINDER FAILED] ${err.message}`);
    const wrapped = new Error(`Failed to send reminder email: ${err.message}`);
    wrapped.status = 502;
    throw wrapped;
  }

  return { ok: true, emailSent, recipient: recipient.email };
}

/**
 * Cancel/Recall a signing request.
 */
async function cancelSigningRequest({ userId, requestId, reason }) {
  const req = await Request.findOne({ _id: requestId, owner_id: userId });
  if (!req) {
    const err = new Error('Signing request not found');
    err.status = 404;
    throw err;
  }

  if (req.status === 'completed') {
    const err = new Error('Cannot cancel an already completed request');
    err.status = 400;
    throw err;
  }

  req.status = 'recalled';
  req.cancelled_at = now();
  req.cancellation_reason = reason || 'Cancelled by sender';
  await req.save();

  // Revoke all pending recipient tokens
  const recipients = await Recipient.find({ request_id: requestId, status: 'pending' });
  await Recipient.updateMany(
    { request_id: requestId, status: 'pending' },
    { status: 'declined', revoked: true }
  );

  const doc = await Document.findById(req.document_id);
  if (doc) {
    doc.status = 'recalled';
    doc.updated = now();
    await doc.save();
    await appendAudit(doc.id, userId, 'request_recalled', { reason: req.cancellation_reason });
  }

  const sender = await User.findById(userId);

  // Send cancellation email to pending recipients
  for (const r of recipients) {
    try {
      await emailService.sendCancellationNotification({
        recipientEmail: r.email,
        recipientName: r.name,
        senderName: sender?.name || 'Sender',
        documentName: doc?.name || 'Document',
        reason: req.cancellation_reason,
      });
    } catch (err) {
      console.warn(`[CANCEL EMAIL ERROR] ${err.message}`);
    }
  }

  return { ok: true, cancelled: true };
}

/**
 * List all signing requests for the user.
 */
async function listSigningRequests(userId) {
  const requests = await Request.find({ owner_id: userId }).sort({ created: -1 });

  const results = [];
  for (const q of requests) {
    const doc = await Document.findById(q.document_id);
    const recipients = await Recipient.find({ request_id: q._id });

    results.push({
      id: q.id,
      document_id: q.document_id,
      subject: q.subject,
      status: q.status,
      created: q.created,
      completed: q.completed,
      document: doc ? doc.name : 'Unknown document',
      signed_filename: doc ? doc.signed_filename : null,
      certificate_id: doc ? doc.certificate_id : null,
      recipients: recipients.map((r) => `${r.name} (${r.email})`).join(', '),
    });
  }

  return results;
}

/**
 * PHASE 4: Get signing info by invitation token (for recipients).
 * Enforces token expiration, revocation, and request state checks.
 */
async function getSigningInfo(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    const err = new Error('Invalid or malformed invitation link');
    err.status = 404;
    throw err;
  }

  const tokenHash = hash(token);
  const recipient = await Recipient.findOne({ token_hash: tokenHash });
  if (!recipient) {
    const err = new Error('Signing invitation not found or link has expired');
    err.status = 404;
    throw err;
  }

  if (recipient.revoked) {
    const err = new Error('This invitation has been revoked or cancelled by the sender');
    err.status = 410;
    throw err;
  }

  if (recipient.expires_at && new Date() > new Date(recipient.expires_at)) {
    const err = new Error('This signing invitation expired. Please ask the sender to resend a link.');
    err.status = 410;
    throw err;
  }

  const request = await Request.findById(recipient.request_id);
  if (!request) {
    const err = new Error('Associated signature request was not found');
    err.status = 404;
    throw err;
  }

  if (request.status === 'recalled') {
    const err = new Error('This signature request was cancelled by the sender');
    err.status = 410;
    throw err;
  }

  const doc = await Document.findById(request.document_id);
  if (!doc) {
    const err = new Error('Associated document was not found');
    err.status = 404;
    throw err;
  }

  return {
    id: recipient.id,
    email: recipient.email,
    name: recipient.name,
    status: recipient.status,
    request_id: request.id,
    subject: request.subject,
    document_name: doc.name,
    filename: doc.filename,
    signed_filename: doc.signed_filename,
    certificate_id: doc.certificate_id,
    mime: doc.mime,
    docid: doc.id,
    expires_at: recipient.expires_at,
  };
}

/**
 * Get the file path for a recipient's document (token-gated).
 */
async function getRecipientDocumentPath(token, variant = 'original') {
  const info = await getSigningInfo(token);
  if (variant === 'signed' && info.signed_filename) {
    return path.join(STORAGE_DIR, info.signed_filename);
  }
  return path.join(STORAGE_DIR, info.filename);
}

/**
 * Get Certificate of Completion file path for recipient (token-gated).
 */
async function getRecipientCertificatePath(token) {
  const info = await getSigningInfo(token);
  if (!info.certificate_id) {
    const err = new Error('Certificate of Completion is not yet generated for this document');
    err.status = 404;
    throw err;
  }
  const cert = await Certificate.findById(info.certificate_id);
  if (!cert || !cert.filename) {
    const err = new Error('Certificate record not found');
    err.status = 404;
    throw err;
  }
  return path.join(STORAGE_DIR, cert.filename);
}

/**
 * PHASE 4, 5, 6: Submit signature, finalize PDF, generate Certificate of Completion, and send notifications.
 */
async function submitSignature(token, { signature, consent, ipAddress, userAgent }) {
  const info = await getSigningInfo(token);

  if (info.status !== 'pending') {
    const err = new Error('This invitation has already been signed or is no longer valid');
    err.status = 409;
    throw err;
  }

  if (consent !== true) {
    const err = new Error('Explicit consent to electronic signing is legally required');
    err.status = 400;
    throw err;
  }

  if (typeof signature !== 'string' || signature.trim().length < 2) {
    const err = new Error('A valid signature (typed name or drawn signature) is required');
    err.status = 400;
    throw err;
  }

  const isDrawn = signature.startsWith('data:image/png');
  const signatureType = isDrawn ? 'draw' : 'type';
  const signingTime = now();

  // Atomically update recipient record
  const recipient = await Recipient.findOneAndUpdate(
    { _id: info.id, status: 'pending' },
    {
      status: 'signed',
      signed: signingTime,
      signature: signature.trim(),
      signature_type: signatureType,
      ip_address: ipAddress || '127.0.0.1',
      user_agent: userAgent || 'Web Browser',
      consent_recorded: true,
      consent_at: signingTime,
    },
    { new: true }
  );

  if (!recipient) {
    const err = new Error('Could not record signature. It may have already been signed.');
    err.status = 409;
    throw err;
  }

  await appendAudit(info.docid, info.email, 'recipient_signed', {
    recipient_id: info.id,
    signature_type: signatureType,
    ip_address: ipAddress || '127.0.0.1',
    consent: true,
  });

  // Check if all required recipients have completed signing
  const remaining = await Recipient.countDocuments({
    request_id: info.request_id,
    status: { $ne: 'signed' },
  });

  let complete = false;
  let certificateRecord = null;

  if (remaining === 0) {
    // ── PHASE 5: FINALIZE SIGNED PDF ──────────────────────────────────────────
    const originalDoc = await Document.findById(info.docid);
    const originalPath = path.join(STORAGE_DIR, originalDoc.filename);
    const originalBytes = fs.readFileSync(originalPath);

    const allSigners = await Recipient.find({ request_id: info.request_id });
    const signersPayload = allSigners.map((s) => ({
      recipient_id: s.id,
      name: s.name,
      email: s.email,
      status: s.status,
      signed_at: s.signed,
      ip_address: s.ip_address,
      user_agent: s.user_agent,
      signature: s.signature,
      signature_type: s.signature_type,
      consent_recorded: s.consent_recorded,
    }));

    const finalPdf = await pdfService.finalizeSignedPdf({
      originalPdfBuffer: originalBytes,
      signers: signersPayload,
      documentName: originalDoc.name,
      documentId: originalDoc.id,
    });

    const signedFilename = `${originalDoc.id}_signed.pdf`;
    fs.writeFileSync(path.join(STORAGE_DIR, signedFilename), finalPdf.buffer);

    // ── PHASE 7: CRYPTOGRAPHIC INTEGRITY SEAL ─────────────────────────────────
    const digitalSeal = digitalSignatureService.signPdfCryptographically(finalPdf.buffer);

    // ── PHASE 6: GENERATE CERTIFICATE OF COMPLETION ───────────────────────────
    const auditEvents = await getAuditTrail(info.docid);
    const certNumber = `CERT-${originalDoc.id.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const certResult = await pdfService.generateCertificateOfCompletion({
      certificateId: certNumber,
      documentName: originalDoc.name,
      documentId: originalDoc.id,
      originalSha256: originalDoc.sha256,
      finalSha256: finalPdf.sha256,
      signers: signersPayload,
      auditEvents,
      createdAt: signingTime,
    });

    const certFilename = `cert_${originalDoc.id}.pdf`;
    fs.writeFileSync(path.join(STORAGE_DIR, certFilename), certResult.buffer);

    certificateRecord = await Certificate.create({
      _id: certResult.certificateId,
      document_id: originalDoc.id,
      request_id: info.request_id,
      document_name: originalDoc.name,
      original_sha256: originalDoc.sha256,
      final_sha256: finalPdf.sha256,
      filename: certFilename,
      sha256: certResult.sha256,
      signers: signersPayload,
      audit_events: auditEvents,
      created_at: signingTime,
      digital_signature: {
        signed: true,
        signer: digitalSeal.certificate?.subject || 'MAAC AI Sign',
        algorithm: digitalSeal.algorithm,
        timestamp: digitalSeal.timestamp,
      },
    });

    // Update document and request statuses atomically
    originalDoc.status = 'completed';
    originalDoc.signed_filename = signedFilename;
    originalDoc.final_sha256 = finalPdf.sha256;
    originalDoc.certificate_id = certificateRecord._id;
    originalDoc.completed_at = signingTime;
    originalDoc.updated = signingTime;
    await originalDoc.save();

    await Request.findByIdAndUpdate(info.request_id, {
      status: 'completed',
      completed: signingTime,
      completion_notified: false,
    });

    await appendAudit(info.docid, 'system', 'document_finalized', {
      final_sha256: finalPdf.sha256,
      certificate_id: certificateRecord._id,
      signed_filename: signedFilename,
    });

    await appendAudit(info.docid, 'system', 'certificate_generated', {
      certificate_id: certificateRecord._id,
      certificate_sha256: certResult.sha256,
    });

    await appendAudit(info.docid, 'system', 'request_completed', {
      request: info.request_id,
    });

    complete = true;

    // ── PHASE 2 & 6: SEND COMPLETION EMAILS VIA BREVO SMTP ───────────────────
    const sender = await User.findById(originalDoc.owner_id);
    const downloadUrl = `${env.FRONTEND_URL}/documents`;
    const certDownloadUrl = `${env.FRONTEND_URL}/documents`;

    // Notify document owner
    if (sender?.email) {
      emailService.sendCompletionNotification({
        recipientEmail: sender.email,
        recipientName: sender.name,
        documentName: originalDoc.name,
        downloadUrl,
        certificateUrl: certDownloadUrl,
        isSender: true,
      }).catch((e) => console.warn(`[COMPLETION EMAIL SENDER ERROR] ${e.message}`));
    }

    // Notify signers
    for (const s of allSigners) {
      if (s.email) {
        emailService.sendCompletionNotification({
          recipientEmail: s.email,
          recipientName: s.name,
          documentName: originalDoc.name,
          downloadUrl: `${env.FRONTEND_URL}/sign/${token}`,
          certificateUrl: `${env.FRONTEND_URL}/sign/${token}`,
          isSender: false,
        }).catch((e) => console.warn(`[COMPLETION EMAIL SIGNER ERROR] ${e.message}`));
      }
    }

    await Request.findByIdAndUpdate(info.request_id, { completion_notified: true });
  }

  return {
    signed: true,
    complete,
    certificateId: certificateRecord?._id || null,
  };
}

module.exports = {
  createSigningRequest,
  resendSigningInvitation,
  cancelSigningRequest,
  listSigningRequests,
  getSigningInfo,
  getRecipientDocumentPath,
  getRecipientCertificatePath,
  submitSignature,
};
