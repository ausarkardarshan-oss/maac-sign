'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Document, Audit, Certificate, Notification } = require('../models');
const { STORAGE_DIR } = require('../config/database');
const { uid, now } = require('../utils/crypto');
const { appendAudit } = require('./auditService');

const MAX_SIZE = 6 * 1024 * 1024; // 6 MB

/**
 * Upload a PDF document (base64 encoded).
 */
async function uploadDocument({ userId, name, base64 }) {
  const data = Buffer.from(base64, 'base64');

  if (data.length > MAX_SIZE) {
    const err = new Error('File exceeds 6 MB limit');
    err.status = 400;
    throw err;
  }
  if (data.length < 8 || data.subarray(0, 5).toString() !== '%PDF-') {
    const err = new Error('Upload a valid PDF file');
    err.status = 400;
    throw err;
  }

  const id = uid();
  const filename = id + '.pdf';
  const sha256Val = crypto.createHash('sha256').update(data).digest('hex');

  fs.writeFileSync(path.join(STORAGE_DIR, filename), data, { flag: 'wx' });

  const doc = await Document.create({
    _id: id,
    owner_id: userId,
    name,
    filename,
    mime: 'application/pdf',
    sha256: sha256Val,
    status: 'draft',
    created: now(),
    updated: now(),
  });

  await appendAudit(id, userId, 'uploaded', { size: data.length });
  try {
    await Notification.create({
      _id: uid(),
      user_id: userId,
      title: 'Document Uploaded',
      message: `"${doc.name}" was uploaded and is ready for signature requests.`,
      type: 'document',
      link: '/documents',
      read: false,
      created: now(),
    });
  } catch {}
  return { id: doc.id, name: doc.name, sha256: doc.sha256, status: doc.status };
}

/**
 * List all documents owned by the user.
 */
async function listDocuments(userId, query) {
  const filter = { owner_id: userId };
  if (query && typeof query === 'string' && query.trim()) {
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [{ name: regex }, { status: regex }];
  }
  const docs = await Document.find(filter).sort({ created: -1 });
  return docs.map((d) => ({
    id: d.id,
    name: d.name,
    mime: d.mime,
    status: d.status,
    sha256: d.sha256,
    final_sha256: d.final_sha256,
    signed_filename: d.signed_filename,
    certificate_id: d.certificate_id,
    created: d.created,
    updated: d.updated,
  }));
}

/**
 * Get one document if owned by the user.
 */
async function getDocument(documentId, userId) {
  return Document.findOne({ _id: documentId, owner_id: userId });
}

/**
 * Rename a document.
 */
async function renameDocument(documentId, userId, newName) {
  const doc = await getDocument(documentId, userId);
  if (!doc) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }

  doc.name = newName;
  doc.updated = now();
  await doc.save();

  await appendAudit(documentId, userId, 'renamed', { from: doc.name, to: newName });
}

/**
 * Delete a draft document.
 */
async function deleteDocument(documentId, userId) {
  const doc = await getDocument(documentId, userId);
  if (!doc) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  if (doc.status !== 'draft') {
    const err = new Error('Only draft documents can be deleted');
    err.status = 409;
    throw err;
  }

  await Audit.deleteMany({ document_id: documentId });
  await Document.deleteOne({ _id: documentId });
  fs.rmSync(path.join(STORAGE_DIR, doc.filename), { force: true });
}

/**
 * Get the filesystem path for a document file (owner check).
 */
async function getDocumentFile(documentId, userId) {
  const doc = await getDocument(documentId, userId);
  if (!doc) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  return { doc, filePath: path.join(STORAGE_DIR, doc.filename) };
}

/**
 * Get audit trail for a document.
 */
async function getAuditTrail(documentId, userId) {
  const doc = await getDocument(documentId, userId);
  if (!doc) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  const audits = await Audit.find({ document_id: documentId }).sort({ at: 1, _id: 1 });
  return audits.map((a) => ({
    actor: a.actor,
    action: a.action,
    details: a.details,
    at: a.at,
    previous_hash: a.previous_hash,
    entry_hash: a.entry_hash,
  }));
}

/**
 * Dashboard stats for the user.
 */
async function getDocumentStats(userId) {
  const stats = await Document.aggregate([
    { $match: { owner_id: userId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const statuses = stats.map((s) => ({ status: s._id, count: s.count }));
  const total = statuses.reduce((sum, item) => sum + item.count, 0);

  return { total, statuses };
}

/**
 * Get the filesystem path for the final signed PDF (owner check).
 */
async function getSignedDocumentFile(documentId, userId) {
  const doc = await getDocument(documentId, userId);
  if (!doc) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  if (!doc.signed_filename) {
    const err = new Error('Document has not been fully signed yet');
    err.status = 400;
    throw err;
  }
  return { doc, filePath: path.join(STORAGE_DIR, doc.signed_filename) };
}

/**
 * Get the filesystem path for the Certificate of Completion PDF (owner check).
 */
async function getCertificateFile(documentId, userId) {
  const doc = await getDocument(documentId, userId);
  if (!doc) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  if (!doc.certificate_id) {
    const err = new Error('Certificate has not been generated for this document');
    err.status = 404;
    throw err;
  }
  const cert = await Certificate.findById(doc.certificate_id);
  if (!cert) {
    const err = new Error('Certificate record not found');
    err.status = 404;
    throw err;
  }
  return { doc, cert, filePath: path.join(STORAGE_DIR, cert.filename) };
}

/**
 * Get digital signature and cryptographic integrity metadata for a document.
 */
async function getDigitalSignatureInfo(documentId, userId) {
  const doc = await getDocument(documentId, userId);
  if (!doc) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  const cert = doc.certificate_id ? await Certificate.findById(doc.certificate_id) : null;

  return {
    documentId: doc.id,
    name: doc.name,
    status: doc.status,
    original_sha256: doc.sha256,
    final_sha256: doc.final_sha256,
    certificate_id: doc.certificate_id,
    digital_signature: cert?.digital_signature || null,
  };
}

module.exports = {
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
};
