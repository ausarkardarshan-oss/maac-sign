'use strict';
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  createSigningRequest,
  createDraftRequest,
  updateDraftRequest,
  setRequestRecipients,
  setSigningFields,
  sendSigningRequest,
  resendSigningInvitation,
  cancelSigningRequest,
  listSigningRequests,
  getSigningRequest,
  getRequestFields,
  getSigningInfo,
  getRecipientDocumentPath,
  getRecipientCertificatePath,
  submitSignature,
  selfSign,
  emailDocument,
} = require('../services/signingService');

const { verifySmtpConnection } = require('../services/emailService');
const fs = require('node:fs');

const router = Router();

// ── Email / SMTP health ───────────────────────────────────────────────────────
router.get('/email/status', requireAuth, async (req, res) => {
  try {
    const status = await verifySmtpConnection();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── List requests ─────────────────────────────────────────────────────────────
router.get('/requests', requireAuth, async (req, res, next) => {
  try {
    const list = await listSigningRequests(req.user.id);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// ── Create draft signing request (multi-step wizard) ─────────────────────────
router.post('/requests/draft', requireAuth, async (req, res, next) => {
  try {
    const { documentId, subject, message, sequentialSigning } = req.body;
    if (!documentId) return res.status(400).json({ error: 'Document is required' });

    const result = await createDraftRequest({
      userId: req.user.id,
      documentId,
      subject,
      message,
      sequentialSigning,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ── Update draft request settings ────────────────────────────────────────────
router.patch('/requests/:id/draft', requireAuth, async (req, res, next) => {
  try {
    const result = await updateDraftRequest({
      userId: req.user.id,
      requestId: req.params.id,
      subject: req.body.subject,
      message: req.body.message,
      sequentialSigning: req.body.sequentialSigning,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Get one request (owner) ───────────────────────────────────────────────────
router.get('/requests/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await getSigningRequest({ userId: req.user.id, requestId: req.params.id });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Set recipients on a draft request ────────────────────────────────────────
router.put('/requests/:id/recipients', requireAuth, async (req, res, next) => {
  try {
    const { recipients } = req.body;
    const result = await setRequestRecipients({
      userId: req.user.id,
      requestId: req.params.id,
      recipients,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Get signing fields for a request ─────────────────────────────────────────
router.get('/requests/:id/fields', requireAuth, async (req, res, next) => {
  try {
    const result = await getRequestFields({ userId: req.user.id, requestId: req.params.id });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Save signing field definitions ───────────────────────────────────────────
router.put('/requests/:id/fields', requireAuth, async (req, res, next) => {
  try {
    const { fields } = req.body;
    const result = await setSigningFields({
      userId: req.user.id,
      requestId: req.params.id,
      fields: fields || [],
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Send draft request (activate and deliver invitations) ─────────────────────
router.post('/requests/:id/send', requireAuth, async (req, res, next) => {
  try {
    const result = await sendSigningRequest({
      userId: req.user.id,
      requestId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Legacy single-recipient POST /api/requests ────────────────────────────────
router.post('/requests', requireAuth, async (req, res, next) => {
  try {
    const { documentId, email, recipientName, subject } = req.body;

    if (!documentId) return res.status(400).json({ error: 'Document is required' });
    const emailClean = (typeof email === 'string' ? email : '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      return res.status(400).json({ error: 'Valid recipient email is required' });
    }
    if (!recipientName || typeof recipientName !== 'string' || recipientName.trim().length < 1) {
      return res.status(400).json({ error: 'Recipient name is required' });
    }
    if (!subject || typeof subject !== 'string' || subject.trim().length < 1) {
      return res.status(400).json({ error: 'Subject is required' });
    }

    const result = await createSigningRequest({
      userId: req.user.id,
      documentId,
      recipientEmail: emailClean,
      recipientName: recipientName.trim(),
      subject: subject.trim(),
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ── Resend invitation ─────────────────────────────────────────────────────────
router.post('/requests/:id/resend', requireAuth, async (req, res, next) => {
  try {
    const result = await resendSigningInvitation({
      userId: req.user.id,
      requestId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Cancel/Recall request ─────────────────────────────────────────────────────
router.post('/requests/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const result = await cancelSigningRequest({
      userId: req.user.id,
      requestId: req.params.id,
      reason: req.body.reason,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Public: Get signing info by invitation token ───────────────────────────────
router.get('/sign/:token', async (req, res, next) => {
  try {
    const info = await getSigningInfo(req.params.token);
    res.json({
      document: info.document_name,
      subject: info.subject,
      message: info.message || '',
      recipient: info.name,
      email: info.email,
      status: info.status,
      waiting_for: info.waiting_for || null,
      expires_at: info.expires_at,
      has_signed_file: Boolean(info.signed_filename),
      has_certificate: Boolean(info.certificate_id),
      order: info.order,
      sequential_signing: info.sequential_signing,
      fields: info.fields || [],
      download: `/api/sign-file/${req.params.token}`,
      download_signed: info.signed_filename ? `/api/sign-file/${req.params.token}/signed` : null,
      download_certificate: info.certificate_id ? `/api/sign-file/${req.params.token}/certificate` : null,
    });
  } catch (err) {
    next(err);
  }
});

// ── Public: Submit signature ──────────────────────────────────────────────────
router.post('/sign/:token', async (req, res, next) => {
  try {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Web Browser';

    const result = await submitSignature(req.params.token, {
      signature: req.body.signature,
      signatureType: req.body.signatureType,
      consent: req.body.consent,
      fieldValues: req.body.fieldValues || {},
      ipAddress,
      userAgent,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Public: Download original document ───────────────────────────────────────
router.get('/sign-file/:token', async (req, res, next) => {
  try {
    const filePath = await getRecipientDocumentPath(req.params.token, 'original');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// ── Public: Download signed document ─────────────────────────────────────────
router.get('/sign-file/:token/signed', async (req, res, next) => {
  try {
    const filePath = await getRecipientDocumentPath(req.params.token, 'signed');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="completed_document.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// ── Public: Download certificate of completion ────────────────────────────────
router.get('/sign-file/:token/certificate', async (req, res, next) => {
  try {
    const filePath = await getRecipientCertificatePath(req.params.token);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Certificate_of_Completion.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
