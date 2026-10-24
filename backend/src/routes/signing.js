'use strict';
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  createSigningRequest,
  resendSigningInvitation,
  cancelSigningRequest,
  listSigningRequests,
  getSigningInfo,
  getRecipientDocumentPath,
  getRecipientCertificatePath,
  submitSignature,
} = require('../services/signingService');
const { verifySmtpConnection } = require('../services/emailService');
const fs = require('node:fs');

const router = Router();

// GET /api/email/status  — SMTP health check (authenticated)
router.get('/email/status', requireAuth, async (req, res) => {
  try {
    const status = await verifySmtpConnection();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests (authenticated)
router.get('/requests', requireAuth, async (req, res, next) => {
  try {
    const list = await listSigningRequests(req.user.id);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// POST /api/requests (authenticated) - create request and send email
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

// POST /api/requests/:id/resend (authenticated) - resend invitation/reminder
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

// POST /api/requests/:id/cancel (authenticated) - cancel/recall request
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

// GET /api/sign/:token  — public (recipient access)
router.get('/sign/:token', async (req, res, next) => {
  try {
    const info = await getSigningInfo(req.params.token);
    res.json({
      document: info.document_name,
      subject: info.subject,
      recipient: info.name,
      email: info.email,
      status: info.status,
      expires_at: info.expires_at,
      has_signed_file: Boolean(info.signed_filename),
      has_certificate: Boolean(info.certificate_id),
      download: `/api/sign-file/${req.params.token}`,
      download_signed: info.signed_filename ? `/api/sign-file/${req.params.token}/signed` : null,
      download_certificate: info.certificate_id ? `/api/sign-file/${req.params.token}/certificate` : null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sign/:token  — public (submit signature)
router.post('/sign/:token', async (req, res, next) => {
  try {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Web Browser';

    const result = await submitSignature(req.params.token, {
      signature: req.body.signature,
      consent: req.body.consent,
      ipAddress,
      userAgent,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/sign-file/:token  — public (download original document for recipient)
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

// GET /api/sign-file/:token/signed  — public (download final executed document for recipient)
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

// GET /api/sign-file/:token/certificate  — public (download certificate of completion for recipient)
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
