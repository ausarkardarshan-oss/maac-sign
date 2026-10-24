'use strict';
const { Template, Form, Document } = require('../models');
const { uid, now } = require('../utils/crypto');

/**
 * List templates for a user.
 */
async function listTemplates(userId) {
  const templates = await Template.find({ owner_id: userId }).sort({ created: -1 });
  const results = [];
  for (const t of templates) {
    const doc = await Document.findById(t.document_id);
    results.push({
      id: t.id,
      name: t.name,
      document_id: t.document_id,
      document: doc ? doc.name : 'Unknown',
      created: t.created,
    });
  }
  return results;
}

/**
 * Create a template.
 */
async function createTemplate(userId, { documentId, name }) {
  const doc = await Document.findOne({ _id: documentId, owner_id: userId });
  if (!doc || !name) {
    const err = new Error('Select a document and provide a template name');
    err.status = 400;
    throw err;
  }
  const id = uid();
  const template = await Template.create({
    _id: id,
    owner_id: userId,
    name,
    document_id: documentId,
    created: now(),
  });
  return { id: template.id, name: template.name };
}

/**
 * List SignForms for a user.
 */
async function listForms(userId) {
  const forms = await Form.find({ owner_id: userId }).sort({ created: -1 });
  const results = [];
  for (const f of forms) {
    const doc = await Document.findById(f.document_id);
    results.push({
      id: f.id,
      name: f.name,
      document_id: f.document_id,
      document: doc ? doc.name : 'Unknown',
      enabled: f.enabled,
      created: f.created,
    });
  }
  return results;
}

/**
 * Create a SignForm.
 */
async function createForm(userId, { documentId, name }) {
  const doc = await Document.findOne({ _id: documentId, owner_id: userId });
  if (!doc || !name) {
    const err = new Error('Select a document and provide a form name');
    err.status = 400;
    throw err;
  }
  const id = uid();
  const form = await Form.create({
    _id: id,
    owner_id: userId,
    name,
    document_id: documentId,
    enabled: 1,
    created: now(),
  });
  return { id: form.id, name: form.name };
}

module.exports = { listTemplates, createTemplate, listForms, createForm };
