'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Request, Recipient, Document, User, Certificate, Audit, Notification, SigningField } = require('../models');
const { STORAGE_DIR } = require('../config/database');
const { uid, now, hash, randomToken } = require('../utils/crypto');
const { appendAudit, getAuditTrail } = require('./auditService');
const emailService = require('./emailService');
const pdfService = require('./pdfService');
const digitalSignatureService = require('./digitalSignatureService');
const env = require('../config/env');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: generate a recipient token pair
// ─────────────────────────────────────────────────────────────────────────────
function makeToken() {
  const token = randomToken(32);
  return { token, tokenHash: hash(token) };
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-STEP WIZARD: Create a draft signing request
// POST /api/requests/draft
// ─────────────────────────────────────────────────────────────────────────────
async function createDraftRequest({ userId, documentId, subject, message, sequentialSigning }) {
  const doc = await Document.findOne({ _id: documentId, owner_id: userId });
  if (!doc) {
    const err = new Error('Document not found or not owned by you');
    err.status = 404;
    throw err;
  }

  // Allow creating draft even if document is already in_progress (so user can edit)
  if (!['draft', 'in_progress'].includes(doc.status)) {
    const err = new Error(`Document is already ${doc.status} and cannot be sent again`);
    err.status = 409;
    throw err;
  }

  const requestId = uid();
  await Request.create({
    _id: requestId,
    document_id: documentId,
    owner_id: userId,
    subject: (subject || '').trim() || `Please sign: ${doc.name}`,
    message: (message || '').trim(),
    sequential_signing: !!sequentialSigning,
    status: 'draft',
    created: now(),
  });

  await appendAudit(documentId, userId, 'request_draft_created', { request: requestId });

  return { id: requestId, status: 'draft' };
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-STEP WIZARD: Update draft request settings
// PATCH /api/requests/:id/draft
// ─────────────────────────────────────────────────────────────────────────────
async function updateDraftRequest({ userId, requestId, subject, message, sequentialSigning }) {
  const req = await Request.findOne({ _id: requestId, owner_id: userId });
  if (!req) {
    const err = new Error('Request not found');
    err.status = 404;
    throw err;
  }
  if (req.status !== 'draft') {
    const err = new Error('Only draft requests can be edited');
    err.status = 409;
    throw err;
  }

  if (subject !== undefined) req.subject = subject.trim();
  if (message !== undefined) req.message = message.trim();
  if (sequentialSigning !== undefined) req.sequential_signing = !!sequentialSigning;
  await req.save();

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-STEP WIZARD: Replace all recipients on a draft request
// PUT /api/requests/:id/recipients
// ─────────────────────────────────────────────────────────────────────────────
async function setRequestRecipients({ userId, requestId, recipients }) {
  const req = await Request.findOne({ _id: requestId, owner_id: userId });
  if (!req) {
    const err = new Error('Request not found');
    err.status = 404;
    throw err;
  }
  if (req.status !== 'draft') {
    const err = new Error('Only draft requests can have recipients changed');
    err.status = 409;
    throw err;
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    const err = new Error('At least one recipient is required');
    err.status = 400;
    throw err;
  }

  // Validate recipients
  const emails = [];
  for (const r of recipients) {
    const emailClean = (typeof r.email === 'string' ? r.email : '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      const err = new Error(`Invalid email address: ${r.email}`);
      err.status = 400;
      throw err;
    }
    if (!r.name || typeof r.name !== 'string' || r.name.trim().length < 1) {
      const err = new Error('Recipient name is required');
      err.status = 400;
      throw err;
    }
    if (emails.includes(emailClean)) {
      const err = new Error(`Duplicate recipient email: ${emailClean}`);
      err.status = 400;
      throw err;
    }
    emails.push(emailClean);
  }

  // Remove old recipients and their tokens
  await Recipient.deleteMany({ request_id: requestId });

  // Create new recipients
  const created = [];
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const { token, tokenHash } = makeToken();
    const recipientId = uid();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await Recipient.create({
      _id: recipientId,
      request_id: requestId,
      email: (r.email || '').trim().toLowerCase(),
      name: (r.name || '').trim(),
      role: r.role || 'signer',
      order: r.order !== undefined ? Number(r.order) : i + 1,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt,
    });

    created.push({ id: recipientId, email: (r.email || '').trim().toLowerCase(), name: (r.name || '').trim(), token });
  }

  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-STEP WIZARD: Save signing field definitions
// PUT /api/requests/:id/fields
// ─────────────────────────────────────────────────────────────────────────────
async function setSigningFields({ userId, requestId, fields }) {
  const req = await Request.findOne({ _id: requestId, owner_id: userId });
  if (!req) {
    const err = new Error('Request not found');
    err.status = 404;
    throw err;
  }
  if (!['draft', 'pending'].includes(req.status)) {
    const err = new Error('Cannot edit fields for a completed or recalled request');
    err.status = 409;
    throw err;
  }

  // Remove old fields
  await SigningField.deleteMany({ request_id: requestId });

  if (!Array.isArray(fields) || fields.length === 0) {
    return [];
  }

  const VALID_TYPES = [
    'signature',
    'initials',
    'initial',
    'stamp',
    'image',
    'company',
    'name',
    'full_name',
    'email',
    'date_signed',
    'sign_date',
    'date',
    'text',
    'title',
    'job_title',
    'checkbox',
    'dropdown',
    'radio',
    'checkbox_group',
  ];

  const created = [];
  for (const f of fields) {
    if (!VALID_TYPES.includes(f.type)) continue;
    if (typeof f.page !== 'number' || f.page < 1) continue;
    if (typeof f.x !== 'number' || typeof f.y !== 'number') continue;
    if (typeof f.width !== 'number' || typeof f.height !== 'number') continue;

    const field = await SigningField.create({
      _id: uid(),
      request_id: requestId,
      document_id: req.document_id,
      recipient_id: f.recipient_id || null,
      page: Math.max(1, Math.round(f.page)),
      type: f.type,
      x: Math.max(0, Math.min(1, Number(f.x))),
      y: Math.max(0, Math.min(1, Number(f.y))),
      width: Math.max(0.01, Math.min(1, Number(f.width))),
      height: Math.max(0.01, Math.min(1, Number(f.height))),
      required: f.required !== false,
      label: f.label || null,
    });
    created.push(field.toJSON());
  }

  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-STEP WIZARD: Send the signing request (finalize draft → send emails)
// POST /api/requests/:id/send
// ─────────────────────────────────────────────────────────────────────────────
async function sendSigningRequest({ userId, requestId }) {
  const req = await Request.findOne({ _id: requestId, owner_id: userId });
  if (!req) {
    const err = new Error('Request not found');
    err.status = 404;
    throw err;
  }
  if (req.status !== 'draft') {
    const err = new Error('Only draft requests can be sent');
    err.status = 409;
    throw err;
  }

  const doc = await Document.findById(req.document_id);
  if (!doc) {
    const err = new Error('Associated document not found');
    err.status = 404;
    throw err;
  }
  if (!['draft', 'in_progress'].includes(doc.status)) {
    const err = new Error('Document is no longer available for signing');
    err.status = 409;
    throw err;
  }

  const recipients = await Recipient.find({ request_id: requestId }).sort({ order: 1 });
  if (recipients.length === 0) {
    const err = new Error('At least one recipient is required before sending');
    err.status = 400;
    throw err;
  }

  const sender = await User.findById(userId);
  const senderName = sender ? sender.name : 'Document Owner';

  // Update request and document statuses
  req.status = 'pending';
  await req.save();

  doc.status = 'in_progress';
  doc.updated = now();
  await doc.save();

  await appendAudit(doc.id, userId, 'request_sent', {
    request: requestId,
    recipients: recipients.length,
    sequential: req.sequential_signing,
  });

  // Determine which recipients to notify now
  // In sequential mode, only the first recipient gets the invite
  const recipientsToNotify = req.sequential_signing
    ? [recipients[0]]
    : recipients;

  const results = [];
  for (const recipient of recipientsToNotify) {
    // Re-generate the actual token from hash is impossible — we need the plaintext
    // So we generate a fresh token for each send action and update the hash
    const { token, tokenHash } = makeToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    recipient.token_hash = tokenHash;
    recipient.expires_at = expiresAt;
    await recipient.save();

    const invitationUrl = `${env.FRONTEND_URL}/sign/${token}`;

    let emailSent = false;
    let emailError = null;

    try {
      const result = await emailService.sendSigningInvitation({
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        senderName,
        documentName: doc.name,
        subject: req.subject,
        invitationUrl,
        expiresAt,
      });
      emailSent = result.success !== false;

      await appendAudit(doc.id, 'system', 'invitation_email_sent', {
        recipient: recipient.email,
        message_id: result.messageId || null,
        simulated: result.simulated || false,
      });
    } catch (err) {
      emailError = err.message || 'SMTP delivery failed';
      console.warn(`[SIGNING] Email delivery failed for ${emailService.maskEmail(recipient.email)}: ${emailError}`);
      await appendAudit(doc.id, 'system', 'invitation_email_failed', {
        recipient: recipient.email,
        error: emailError,
      });
    }

    results.push({
      recipientId: recipient.id,
      email: recipient.email,
      emailSent,
      emailError,
      invitation: invitationUrl,
    });
  }

  try {
    await Notification.create({
      _id: uid(),
      user_id: userId,
      title: 'Signature Request Sent',
      message: `Request for "${doc.name}" was dispatched to ${recipients.length} recipient(s).`,
      type: 'request',
      link: '/requests',
      read: false,
      created: now(),
    });
  } catch {}

  return { id: requestId, status: 'pending', results };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY: Create a signing request for a document (single-recipient, backwards compat)
// POST /api/requests
// ─────────────────────────────────────────────────────────────────────────────
async function createSigningRequest({ userId, documentId, recipientEmail, recipientName, subject }) {
  const doc = await Document.findOne({ _id: documentId, owner_id: userId });
  if (!doc) {
    const err = new Error('Document not found or not owned by you');
    err.status = 404;
    throw err;
  }
  if (!['draft', 'in_progress'].includes(doc.status)) {
    const err = new Error('Only draft documents can be sent for signing');
    err.status = 409;
    throw err;
  }

  const sender = await User.findById(userId);
  const senderName = sender ? sender.name : 'Document Owner';

  const requestId = uid();
  const recipientId = uid();
  const { token, tokenHash } = makeToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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
    order: 1,
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

  try {
    await Notification.create({
      _id: uid(),
      user_id: userId,
      title: 'Signature Request Sent',
      message: `Request for "${doc.name}" was dispatched to ${recipientEmail}.`,
      type: 'request',
      link: '/requests',
      read: false,
      created: now(),
    });
  } catch {}

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

// ─────────────────────────────────────────────────────────────────────────────
// Resend a signing invitation email (with rate-limiting/reminder tracking).
// ─────────────────────────────────────────────────────────────────────────────
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

  // Rate limit: minimum 5 minutes between reminders
  if (recipient.last_reminder_sent && (Date.now() - new Date(recipient.last_reminder_sent).getTime() < 5 * 60 * 1000)) {
    const err = new Error('A reminder was sent recently. Please wait 5 minutes before resending.');
    err.status = 429;
    throw err;
  }

  const doc = await Document.findById(req.document_id);
  const sender = await User.findById(userId);

  // Generate fresh token
  const { token, tokenHash } = makeToken();
  recipient.token_hash = tokenHash;
  recipient.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  recipient.last_reminder_sent = new Date();
  await recipient.save();

  const invitationUrl = `${env.FRONTEND_URL}/sign/${token}`;

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

// ─────────────────────────────────────────────────────────────────────────────
// Cancel/Recall a signing request.
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// List all signing requests for the user.
// ─────────────────────────────────────────────────────────────────────────────
async function listSigningRequests(userId) {
  const requests = await Request.find({ owner_id: userId }).sort({ created: -1 });

  const results = [];
  for (const q of requests) {
    const doc = await Document.findById(q.document_id);
    const recipients = await Recipient.find({ request_id: q._id }).sort({ order: 1 });

    results.push({
      id: q.id,
      document_id: q.document_id,
      subject: q.subject,
      message: q.message,
      sequential_signing: q.sequential_signing,
      status: q.status,
      created: q.created,
      completed: q.completed,
      document: doc ? doc.name : 'Unknown document',
      signed_filename: doc ? doc.signed_filename : null,
      certificate_id: doc ? doc.certificate_id : null,
      recipients: recipients.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        order: r.order,
        status: r.status,
        signed: r.signed,
        viewed_at: r.viewed_at,
      })),
      recipients_summary: recipients.map((r) => `${r.name} (${r.email})`).join(', '),
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get one signing request for the owner with full details
// ─────────────────────────────────────────────────────────────────────────────
async function getSigningRequest({ userId, requestId }) {
  const req = await Request.findOne({ _id: requestId, owner_id: userId });
  if (!req) {
    const err = new Error('Signing request not found');
    err.status = 404;
    throw err;
  }

  const doc = await Document.findById(req.document_id);
  const recipients = await Recipient.find({ request_id: requestId }).sort({ order: 1 });
  const fields = await SigningField.find({ request_id: requestId });
  const auditTrail = await getAuditTrail(req.document_id);

  return {
    id: req.id,
    document_id: req.document_id,
    subject: req.subject,
    message: req.message,
    sequential_signing: req.sequential_signing,
    status: req.status,
    created: req.created,
    completed: req.completed,
    document: doc ? { id: doc.id, name: doc.name, status: doc.status, sha256: doc.sha256, final_sha256: doc.final_sha256, signed_filename: doc.signed_filename, certificate_id: doc.certificate_id } : null,
    recipients: recipients.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      order: r.order,
      status: r.status,
      signed: r.signed,
      viewed_at: r.viewed_at,
      consent_recorded: r.consent_recorded,
    })),
    fields: fields.map((f) => f.toJSON()),
    audit: auditTrail,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Get signing field definitions for a request (owner only)
// ─────────────────────────────────────────────────────────────────────────────
async function getRequestFields({ userId, requestId }) {
  const req = await Request.findOne({ _id: requestId, owner_id: userId });
  if (!req) {
    const err = new Error('Request not found');
    err.status = 404;
    throw err;
  }

  const fields = await SigningField.find({ request_id: requestId });
  return fields.map((f) => f.toJSON());
}

// ─────────────────────────────────────────────────────────────────────────────
// Get signing info by invitation token (for recipients). Tracks viewed_at.
// ─────────────────────────────────────────────────────────────────────────────
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

  // Track viewed_at (first time only)
  if (!recipient.viewed_at && recipient.status === 'pending') {
    recipient.viewed_at = now();
    await recipient.save();
    await appendAudit(doc.id, recipient.email, 'recipient_viewed', {
      recipient_id: recipient.id,
      order: recipient.order,
    });
  }

  // In sequential signing mode, check whether this recipient is allowed to sign
  if (request.sequential_signing && recipient.status === 'pending') {
    const previousPending = await Recipient.findOne({
      request_id: request.id,
      order: { $lt: recipient.order },
      status: 'pending',
    });
    if (previousPending) {
      // Return info but mark as "waiting for previous signer"
      return {
        id: recipient.id,
        email: recipient.email,
        name: recipient.name,
        status: 'waiting',
        waiting_for: previousPending.name,
        request_id: request.id,
        subject: request.subject,
        document_name: doc.name,
        filename: doc.filename,
        signed_filename: doc.signed_filename,
        certificate_id: doc.certificate_id,
        mime: doc.mime,
        docid: doc.id,
        expires_at: recipient.expires_at,
        order: recipient.order,
        sequential_signing: request.sequential_signing,
        fields: [],
      };
    }
  }

  // Load fields assigned to this recipient
  const fields = await SigningField.find({
    request_id: request.id,
    $or: [
      { recipient_id: recipient.id },
      { recipient_id: null },
    ],
  });

  return {
    id: recipient.id,
    email: recipient.email,
    name: recipient.name,
    status: recipient.status,
    request_id: request.id,
    subject: request.subject,
    message: request.message || '',
    document_name: doc.name,
    filename: doc.filename,
    signed_filename: doc.signed_filename,
    certificate_id: doc.certificate_id,
    mime: doc.mime,
    docid: doc.id,
    expires_at: recipient.expires_at,
    order: recipient.order,
    sequential_signing: request.sequential_signing,
    fields: fields.map((f) => ({
      id: f.id,
      type: f.type,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      required: f.required,
      label: f.label,
      value: f.value,
      completed: f.completed,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Get the file path for a recipient's document (token-gated).
// ─────────────────────────────────────────────────────────────────────────────
async function getRecipientDocumentPath(token, variant = 'original') {
  const info = await getSigningInfo(token);
  if (variant === 'signed' && info.signed_filename) {
    return path.join(STORAGE_DIR, info.signed_filename);
  }
  return path.join(STORAGE_DIR, info.filename);
}

// ─────────────────────────────────────────────────────────────────────────────
// Get Certificate of Completion file path for recipient (token-gated).
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Submit signature + field values, finalize PDF, generate certificate.
// ─────────────────────────────────────────────────────────────────────────────
async function submitSignature(token, { signature, signatureType: customSignatureType, consent, fieldValues = {}, ipAddress, userAgent }) {
  const info = await getSigningInfo(token);

  if (info.status === 'waiting') {
    const err = new Error(`Please wait until ${info.waiting_for || 'the previous signer'} completes their signature`);
    err.status = 409;
    throw err;
  }

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
    const err = new Error('A valid signature (typed name, drawn signature, or uploaded signature image) is required');
    err.status = 400;
    throw err;
  }

  // Validate required fields are provided
  const requiredFields = info.fields.filter(
    (f) => f.required && !['date_signed', 'sign_date', 'signature'].includes(f.type)
  );
  for (const f of requiredFields) {
    const val = fieldValues[f.id];
    if (val === undefined || val === null || val === '') {
      if (f.type !== 'checkbox' && f.type !== 'radio') {
        const err = new Error(`Required field "${f.label || f.type}" is missing`);
        err.status = 400;
        throw err;
      }
    }
  }

  const isImage = signature.startsWith('data:image/');
  const signatureType = ['type', 'draw', 'upload'].includes(customSignatureType)
    ? customSignatureType
    : (isImage ? 'draw' : 'type');
  const signingTime = now();

  // Save completed field values
  if (fieldValues && typeof fieldValues === 'object') {
    for (const [fieldId, value] of Object.entries(fieldValues)) {
      await SigningField.findByIdAndUpdate(fieldId, {
        value: typeof value === 'string' ? value : JSON.stringify(value),
        completed: true,
      });
    }
  }

  // Auto-complete signature and initials fields
  await SigningField.updateMany(
    { request_id: info.request_id, recipient_id: info.id, type: { $in: ['signature', 'initials', 'initial'] } },
    { value: signature.trim(), completed: true }
  );

  // Auto-complete date_signed / sign_date fields
  await SigningField.updateMany(
    { request_id: info.request_id, recipient_id: info.id, type: { $in: ['date_signed', 'sign_date'] } },
    { value: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), completed: true }
  );

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
      field_values: fieldValues || {},
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

  // In sequential mode, send invitation to next recipient
  const request = await Request.findById(info.request_id);
  if (request && request.sequential_signing) {
    const nextRecipient = await Recipient.findOne({
      request_id: info.request_id,
      order: { $gt: recipient.order },
      status: 'pending',
      revoked: { $ne: true },
    }).sort({ order: 1 });

    if (nextRecipient) {
      const sender = await User.findById(request.owner_id);
      const doc = await Document.findById(info.docid);
      const { token: nextToken, tokenHash: nextHash } = makeToken();
      const nextExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      nextRecipient.token_hash = nextHash;
      nextRecipient.expires_at = nextExpiry;
      await nextRecipient.save();

      const nextUrl = `${env.FRONTEND_URL}/sign/${nextToken}`;
      try {
        await emailService.sendSigningInvitation({
          recipientEmail: nextRecipient.email,
          recipientName: nextRecipient.name,
          senderName: sender?.name || 'Document Owner',
          documentName: doc?.name || 'Document',
          subject: request.subject,
          invitationUrl: nextUrl,
          expiresAt: nextExpiry,
        });
        await appendAudit(info.docid, 'system', 'sequential_invitation_sent', {
          recipient: nextRecipient.email,
          order: nextRecipient.order,
        });
      } catch (e) {
        console.warn(`[SEQUENTIAL INVITE] Failed to send to ${nextRecipient.email}: ${e.message}`);
      }
    }
  }

  // Check if all required recipients have completed signing
  const remaining = await Recipient.countDocuments({
    request_id: info.request_id,
    status: { $ne: 'signed' },
    revoked: { $ne: true },
  });

  let complete = false;
  let certificateRecord = null;

  if (remaining === 0) {
    // ── FINALIZE SIGNED PDF ──────────────────────────────────────────────────
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

    // Load all signing fields with their completed values
    const allFields = await SigningField.find({ request_id: info.request_id });

    const finalPdf = await pdfService.finalizeSignedPdf({
      originalPdfBuffer: originalBytes,
      signers: signersPayload,
      documentName: originalDoc.name,
      documentId: originalDoc.id,
      fields: allFields.map((f) => f.toJSON()),
    });

    const signedFilename = `${originalDoc.id}_signed.pdf`;
    fs.writeFileSync(path.join(STORAGE_DIR, signedFilename), finalPdf.buffer);

    // ── CRYPTOGRAPHIC INTEGRITY SEAL ─────────────────────────────────────────
    const digitalSeal = digitalSignatureService.signPdfCryptographically(finalPdf.buffer);

    // ── GENERATE CERTIFICATE OF COMPLETION ───────────────────────────────────
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

    // ── SEND COMPLETION EMAILS ────────────────────────────────────────────────
    const sender = await User.findById(originalDoc.owner_id);
    const downloadUrl = `${env.FRONTEND_URL}/documents`;
    const certDownloadUrl = `${env.FRONTEND_URL}/documents`;

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

    try {
      await Notification.create({
        _id: uid(),
        user_id: originalDoc.owner_id,
        title: 'Document Fully Signed! 🎉',
        message: `"${originalDoc.name}" has been completed and certified with an audit trail.`,
        type: 'signing',
        link: '/documents',
        read: false,
        created: now(),
      });
    } catch {}
  }

  return {
    signed: true,
    complete,
    certificateId: certificateRecord?._id || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-sign workflow: sign yourself (owner signs without external recipient)
// ─────────────────────────────────────────────────────────────────────────────
async function selfSign({ userId, documentId, signature, signatureType, consent, fieldValues = {}, fields = [], ipAddress, userAgent }) {
  const doc = await Document.findOne({ _id: documentId, owner_id: userId });
  if (!doc) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  if (!['draft', 'in_progress'].includes(doc.status)) {
    const err = new Error('Document is not available for signing');
    err.status = 409;
    throw err;
  }

  if (consent !== true) {
    const err = new Error('Explicit consent to electronic signing is legally required');
    err.status = 400;
    throw err;
  }

  if (typeof signature !== 'string' || signature.trim().length < 2) {
    const err = new Error('A valid signature is required');
    err.status = 400;
    throw err;
  }

  const user = await User.findById(userId);
  const signerName = user?.name || 'Document Owner';
  const signerEmail = user?.email || 'owner@example.com';
  const signingTime = now();
  const isDrawn = signature.startsWith('data:image/png');

  // Create request and recipient with "already signed" status
  const requestId = uid();
  const recipientId = uid();
  const { token, tokenHash } = makeToken();

  await Request.create({
    _id: requestId,
    document_id: documentId,
    owner_id: userId,
    subject: `Self-signed: ${doc.name}`,
    status: 'pending',
    created: signingTime,
  });

  await Recipient.create({
    _id: recipientId,
    request_id: requestId,
    email: signerEmail,
    name: signerName,
    order: 1,
    token_hash: tokenHash,
    status: 'pending',
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  // Save any placed fields so finalizeSignedPdf overlays them at exact positions
  if (Array.isArray(fields) && fields.length > 0) {
    for (const f of fields) {
      await SigningField.create({
        _id: uid(),
        request_id: requestId,
        recipient_id: recipientId,
        page: Number(f.page) || 1,
        type: f.type || 'signature',
        label: f.label || 'Signature',
        x: Number(f.x) || 0.6,
        y: Number(f.y) || 0.8,
        width: Number(f.width) || 0.25,
        height: Number(f.height) || 0.08,
        required: f.required !== false,
        value: f.type === 'signature' ? signature.trim() : (f.value || ''),
        completed: true,
      });
    }
  }

  await appendAudit(documentId, userId, 'self_sign_started', { request: requestId });

  // Submit via the normal submitSignature path using the token
  const result = await submitSignature(token, {
    signature,
    signatureType,
    consent,
    fieldValues,
    ipAddress,
    userAgent,
  });

  return { ...result, requestId, token };
}

// ─────────────────────────────────────────────────────────────────────────────
// Email a completed document to a recipient
// ─────────────────────────────────────────────────────────────────────────────
async function emailDocument({ userId, documentId, toEmail, toName }) {
  const doc = await Document.findOne({ _id: documentId, owner_id: userId });
  if (!doc) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  if (doc.status !== 'completed' || !doc.signed_filename) {
    const err = new Error('Document is not yet completed');
    err.status = 400;
    throw err;
  }

  const emailClean = (typeof toEmail === 'string' ? toEmail : '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
    const err = new Error('Valid destination email is required');
    err.status = 400;
    throw err;
  }

  const sender = await User.findById(userId);
  const downloadUrl = `${env.FRONTEND_URL}/documents`;

  let emailSent = false;
  try {
    const result = await emailService.sendCompletionNotification({
      recipientEmail: emailClean,
      recipientName: toName || toEmail,
      documentName: doc.name,
      downloadUrl,
      certificateUrl: downloadUrl,
      isSender: false,
    });
    emailSent = result.success !== false;

    await appendAudit(documentId, userId, 'document_emailed', {
      to: emailClean,
      message_id: result.messageId || null,
    });
  } catch (err) {
    const wrapped = new Error(`Email delivery failed: ${err.message}`);
    wrapped.status = 502;
    throw wrapped;
  }

  return { ok: true, emailSent, to: emailClean };
}

module.exports = {
  // Multi-step wizard
  createDraftRequest,
  updateDraftRequest,
  setRequestRecipients,
  setSigningFields,
  sendSigningRequest,
  // Legacy single-recipient
  createSigningRequest,
  // Management
  resendSigningInvitation,
  cancelSigningRequest,
  listSigningRequests,
  getSigningRequest,
  getRequestFields,
  // Public (recipient)
  getSigningInfo,
  getRecipientDocumentPath,
  getRecipientCertificatePath,
  submitSignature,
  // Self-sign
  selfSign,
  // Post-completion
  emailDocument,
};
