'use strict';
const { Template, Form, Document, Notification } = require('../models');
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
      id: t.id || t._id,
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
  try {
    await Notification.create({
      _id: uid(),
      user_id: userId,
      title: 'Template Created',
      message: `Template "${template.name}" is now ready for reusable signing.`,
      type: 'template',
      link: '/templates',
      read: false,
      created: now(),
    });
  } catch {}
  return { id: template.id || template._id, name: template.name };
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
      id: f.id || f._id,
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
  try {
    await Notification.create({
      _id: uid(),
      user_id: userId,
      title: 'SignForm Created',
      message: `SignForm "${form.name}" has been established.`,
      type: 'signform',
      link: '/signforms',
      read: false,
      created: now(),
    });
  } catch {}
  return { id: form.id || form._id, name: form.name };
}

/**
 * Delete a template.
 */
async function deleteTemplate(userId, templateId) {
  if (!templateId) {
    const err = new Error('Template ID is required');
    err.status = 400;
    throw err;
  }
  const idStr = String(templateId);
  const result = await Template.findOneAndDelete({
    $or: [{ _id: idStr }, { id: idStr }],
    owner_id: userId,
  });
  if (!result) {
    const err = new Error('Template not found');
    err.status = 404;
    throw err;
  }
  return { ok: true };
}

/**
 * Delete a SignForm.
 */
async function deleteForm(userId, formId) {
  if (!formId) {
    const err = new Error('SignForm ID is required');
    err.status = 400;
    throw err;
  }
  const idStr = String(formId);
  const result = await Form.findOneAndDelete({
    $or: [{ _id: idStr }, { id: idStr }],
    owner_id: userId,
  });
  if (!result) {
    const err = new Error('SignForm not found');
    err.status = 404;
    throw err;
  }
  return { ok: true };
}

module.exports = {
  listTemplates,
  createTemplate,
  deleteTemplate,
  listForms,
  createForm,
  deleteForm,
};
