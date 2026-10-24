'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const Document = require('../src/models/Document');
const { listDocuments } = require('../src/services/documentService');

test('Document Search Functionality', async (t) => {
  await connectDB();

  const testUserId = 'test-user-search-' + Date.now();

  // Create test documents
  await Document.create([
    {
      owner_id: testUserId,
      name: 'Employment Agreement 2026.pdf',
      filename: 'emp_2026.pdf',
      sha256: 'abc1234567890',
      status: 'draft',
    },
    {
      owner_id: testUserId,
      name: 'Non-Disclosure Agreement NDA.pdf',
      filename: 'nda_2026.pdf',
      sha256: 'def1234567890',
      status: 'in_progress',
    },
    {
      owner_id: testUserId,
      name: 'Vendor Service Contract.pdf',
      filename: 'vendor_contract.pdf',
      sha256: 'ghi1234567890',
      status: 'completed',
    },
  ]);

  await t.test('listDocuments returns all documents when no query is passed', async () => {
    const docs = await listDocuments(testUserId);
    assert.equal(docs.length, 3);
  });

  await t.test('listDocuments filters documents by name query', async () => {
    const employmentDocs = await listDocuments(testUserId, 'Employment');
    assert.equal(employmentDocs.length, 1);
    assert.equal(employmentDocs[0].name, 'Employment Agreement 2026.pdf');

    const agreementDocs = await listDocuments(testUserId, 'agreement');
    assert.equal(agreementDocs.length, 2);
  });

  await t.test('listDocuments filters documents by status query', async () => {
    const completedDocs = await listDocuments(testUserId, 'completed');
    assert.equal(completedDocs.length, 1);
    assert.equal(completedDocs[0].name, 'Vendor Service Contract.pdf');
  });

  await t.test('listDocuments returns empty array for non-matching query', async () => {
    const noDocs = await listDocuments(testUserId, 'xyzNonExistent999');
    assert.equal(noDocs.length, 0);
  });

  // Cleanup
  await Document.deleteMany({ owner_id: testUserId });
  await mongoose.connection.close();
});
