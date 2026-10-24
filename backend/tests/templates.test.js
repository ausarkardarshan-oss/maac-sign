'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const Document = require('../src/models/Document');
const { Template, Form } = require('../src/models');
const {
  createTemplate,
  deleteTemplate,
  listTemplates,
  createForm,
  deleteForm,
  listForms,
} = require('../src/services/templateService');

test('Template and Form deletion functionality', async (t) => {
  await connectDB();
  const testUserId = 'test-user-del-' + Date.now();

  const doc = await Document.create({
    owner_id: testUserId,
    name: 'Sample Agreement.pdf',
    filename: 'sample.pdf',
    sha256: 'sample123',
  });

  await t.test('create and delete a template', async () => {
    const created = await createTemplate(testUserId, { documentId: doc.id, name: 'NDA Template' });
    assert.ok(created.id);

    let templates = await listTemplates(testUserId);
    assert.equal(templates.length, 1);
    assert.equal(templates[0].name, 'NDA Template');

    // Delete template
    const delRes = await deleteTemplate(testUserId, created.id);
    assert.equal(delRes.ok, true);

    templates = await listTemplates(testUserId);
    assert.equal(templates.length, 0);
  });

  await t.test('create and delete a SignForm', async () => {
    const created = await createForm(testUserId, { documentId: doc.id, name: 'Client Onboarding Form' });
    assert.ok(created.id);

    let forms = await listForms(testUserId);
    assert.equal(forms.length, 1);
    assert.equal(forms[0].name, 'Client Onboarding Form');

    // Delete form
    const delRes = await deleteForm(testUserId, created.id);
    assert.equal(delRes.ok, true);

    forms = await listForms(testUserId);
    assert.equal(forms.length, 0);
  });

  // Cleanup
  await Document.deleteMany({ owner_id: testUserId });
  await Template.deleteMany({ owner_id: testUserId });
  await Form.deleteMany({ owner_id: testUserId });
  await mongoose.connection.close();
});
