'use strict';
const { Audit } = require('../models');
const { uid, now, hash } = require('../utils/crypto');

/**
 * Append an audit event with chained SHA-256 integrity.
 * @param {string} documentId
 * @param {string} actor  - user ID or email
 * @param {string} action - event type
 * @param {object} details
 */
async function appendAudit(documentId, actor, action, details = {}) {
  const lastEntry = await Audit.findOne({ document_id: documentId }).sort({ at: -1, _id: -1 });
  const prev = lastEntry?.entry_hash || '';

  const at = now();
  const payload = JSON.stringify(details);
  const entry = hash([documentId, actor, action, payload, at, prev].join('|'));

  await Audit.create({
    _id: uid(),
    document_id: documentId,
    actor,
    action,
    details: payload,
    at,
    previous_hash: prev,
    entry_hash: entry,
  });
}

/**
 * Retrieve the full chronological audit trail for a document.
 */
async function getAuditTrail(documentId) {
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

module.exports = { appendAudit, getAuditTrail };
