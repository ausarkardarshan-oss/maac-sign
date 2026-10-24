'use strict';
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  uploadDocument,
  listDocuments,
  getDocument,
  renameDocument,
  deleteDocument,
  getDocumentFile,
  getSignedDocumentFile,
  getCertificateFile,
  getDigitalSignatureInfo,
  getAuditTrail,
  getDocumentStats,
} = require('../services/documentService');

const router = Router();

// All document routes require authentication
router.use(requireAuth);

// GET /api/documents
router.get('/', async (req, res, next) => {
  try {
    const list = await listDocuments(req.user.id, req.query.q);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// POST /api/documents - upload (base64)
router.post('/', async (req, res, next) => {
  try {
    const { name, base64 } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 150) {
      return res.status(400).json({ error: 'Document name is required (max 150 characters)' });
    }
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'PDF file is required (base64 encoded)' });
    }

    const result = await uploadDocument({ userId: req.user.id, name: name.trim(), base64 });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/stats
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await getDocumentStats(req.user.id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await getDocument(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/documents/:id - rename
router.patch('/:id', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 150) {
      return res.status(400).json({ error: 'Valid document name is required (max 150 characters)' });
    }
    await renameDocument(req.params.id, req.user.id, name.trim());
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await deleteDocument(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/download
router.get('/:id/download', async (req, res, next) => {
  try {
    const { doc, filePath } = await getDocumentFile(req.params.id, req.user.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.name)}.pdf"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    require('node:fs').createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/download-signed
router.get('/:id/download-signed', async (req, res, next) => {
  try {
    const { doc, filePath } = await getSignedDocumentFile(req.params.id, req.user.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.name)}_signed.pdf"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    require('node:fs').createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/certificate
router.get('/:id/certificate', async (req, res, next) => {
  try {
    const { doc, cert, filePath } = await getCertificateFile(req.params.id, req.user.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Certificate_${encodeURIComponent(doc.name)}.pdf"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    require('node:fs').createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/digital-signature
router.get('/:id/digital-signature', async (req, res, next) => {
  try {
    const info = await getDigitalSignatureInfo(req.params.id, req.user.id);
    res.json(info);
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/audit
router.get('/:id/audit', async (req, res, next) => {
  try {
    const trail = await getAuditTrail(req.params.id, req.user.id);
    res.json(trail);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
