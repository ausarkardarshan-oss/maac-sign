'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { connectDB, disconnectDB, STORAGE_DIR } = require('../src/config/database');
const { User, Document, Request, Recipient, SigningField, Certificate } = require('../src/models');
const { uid, now, hash } = require('../src/utils/crypto');
const signingService = require('../src/services/signingService');
const pdfService = require('../src/services/pdfService');

test('Multi-Recipient, Field Stamping, Sequential Signing, and Self-Sign Workflows', async (t) => {
  let testUser;
  let testDoc;
  let pdfBuffer;

  t.before(async () => {
    await connectDB();

    // Create test user
    testUser = await User.create({
      _id: uid(),
      email: `test_workflow_${Date.now()}@example.com`,
      name: 'Workflow Tester',
      hash: 'testhash12345678',
      salt: 'testsalt12345678',
      created: now(),
    });

    // Generate a valid minimal PDF buffer
    const baseDoc = await PDFDocument.create();
    const p1 = baseDoc.addPage([612, 792]);
    const f1 = await baseDoc.embedFont(StandardFonts.Helvetica);
    p1.drawText('MAAC AI Sign Agreement Body', { x: 50, y: 700, size: 14, font: f1 });
    const pBytes = await baseDoc.save();
    pdfBuffer = Buffer.from(pBytes);

    const docId = uid();
    const filename = `${docId}.pdf`;
    fs.writeFileSync(path.join(STORAGE_DIR, filename), pdfBuffer);

    testDoc = await Document.create({
      _id: docId,
      owner_id: testUser.id,
      name: 'Multi-Signer Contract.pdf',
      filename,
      mime: 'application/pdf',
      size: pdfBuffer.length,
      sha256: pdfService.sha256(pdfBuffer),
      status: 'draft',
      created: now(),
      updated: now(),
    });
  });

  t.after(async () => {
    if (testDoc) {
      await Document.deleteMany({ _id: testDoc.id });
      try { fs.rmSync(path.join(STORAGE_DIR, testDoc.filename), { force: true }); } catch {}
      try { fs.rmSync(path.join(STORAGE_DIR, `${testDoc.id}_signed.pdf`), { force: true }); } catch {}
      try { fs.rmSync(path.join(STORAGE_DIR, `cert_${testDoc.id}.pdf`), { force: true }); } catch {}
    }
    if (testUser) {
      await User.deleteMany({ _id: testUser.id });
    }
    await disconnectDB();
  });

  await t.test('PDF Service: finalizeSignedPdf overlays fields onto pages and preserves original', async () => {
    const signers = [
      {
        recipient_id: 'r_1',
        name: 'Alice Johnson',
        email: 'alice@example.com',
        signature: 'Typed: Alice Johnson',
        signature_type: 'type',
        signed_at: new Date().toISOString(),
      },
    ];

    const fields = [
      {
        page: 1,
        type: 'signature',
        x: 0.1,
        y: 0.8,
        width: 0.3,
        height: 0.05,
        recipient_id: 'r_1',
      },
      {
        page: 1,
        type: 'date_signed',
        x: 0.5,
        y: 0.8,
        width: 0.2,
        height: 0.04,
        value: 'October 27, 2026',
        recipient_id: 'r_1',
      },
      {
        page: 1,
        type: 'checkbox',
        x: 0.1,
        y: 0.85,
        width: 0.04,
        height: 0.04,
        value: true,
        recipient_id: 'r_1',
      },
    ];

    const finalized = await pdfService.finalizeSignedPdf({
      originalPdfBuffer: pdfBuffer,
      signers,
      documentName: testDoc.name,
      documentId: testDoc.id,
      fields,
    });

    assert.ok(finalized.buffer instanceof Buffer);
    assert.ok(finalized.buffer.length > pdfBuffer.length);
    assert.equal(typeof finalized.sha256, 'string');
    assert.equal(finalized.sha256.length, 64);
  });

  await t.test('Multi-step draft request creation and recipient configuration', async () => {
    // 1. Create draft request
    const draft = await signingService.createDraftRequest({
      userId: testUser.id,
      documentId: testDoc.id,
      subject: 'Review & Sign Contract',
      message: 'Please review and execute in order.',
      sequentialSigning: true,
    });
    assert.ok(draft.id);
    assert.equal(draft.status, 'draft');

    // 2. Set recipients
    const recipients = [
      { email: 'signer1@example.com', name: 'Signer One', role: 'signer', order: 1 },
      { email: 'signer2@example.com', name: 'Signer Two', role: 'signer', order: 2 },
    ];
    const savedRecipients = await signingService.setRequestRecipients({
      userId: testUser.id,
      requestId: draft.id,
      recipients,
    });
    assert.equal(savedRecipients.length, 2);
    assert.equal(savedRecipients[0].name, 'Signer One');
    assert.equal(savedRecipients[1].name, 'Signer Two');

    // 3. Set signing fields
    const fields = [
      {
        type: 'signature',
        page: 1,
        x: 0.1,
        y: 0.5,
        width: 0.25,
        height: 0.05,
        recipient_id: savedRecipients[0].id,
        required: true,
      },
      {
        type: 'signature',
        page: 1,
        x: 0.1,
        y: 0.65,
        width: 0.25,
        height: 0.05,
        recipient_id: savedRecipients[1].id,
        required: true,
      },
    ];
    const savedFields = await signingService.setSigningFields({
      userId: testUser.id,
      requestId: draft.id,
      fields,
    });
    assert.equal(savedFields.length, 2);

    // 4. Send request
    const sendResult = await signingService.sendSigningRequest({
      userId: testUser.id,
      requestId: draft.id,
    });
    assert.equal(sendResult.status, 'pending');
    assert.ok(sendResult.results.length >= 1);

    // 5. Sequential signing check:
    // Signer 1 should be able to get signing info
    const recipient1 = await Recipient.findOne({ request_id: draft.id, order: 1 });
    const recipient2 = await Recipient.findOne({ request_id: draft.id, order: 2 });

    // Generate unique random tokens for recipient 1 and recipient 2
    const crypto = require('node:crypto');
    const token1 = crypto.randomBytes(32).toString('hex');
    recipient1.token_hash = hash(token1);
    await recipient1.save();

    const token2 = crypto.randomBytes(32).toString('hex');
    recipient2.token_hash = hash(token2);
    await recipient2.save();

    // Check Signer 2 (order 2) info before Signer 1 signs: should be waiting!
    const info2 = await signingService.getSigningInfo(token2);
    assert.equal(info2.status, 'waiting');
    assert.equal(info2.waiting_for, 'Signer One');

    // Attempting to sign as Signer 2 should be rejected!
    await assert.rejects(
      () => signingService.submitSignature(token2, { signature: 'Signer Two', consent: true }),
      /Please wait until Signer One/
    );

    // Signer 1 signs
    const sign1Result = await signingService.submitSignature(token1, {
      signature: 'Typed: Signer One',
      consent: true,
      fieldValues: {},
    });
    assert.equal(sign1Result.signed, true);
    assert.equal(sign1Result.complete, false); // Document not yet complete, needs Signer 2

    // Now Signer 2 is unblocked!
    const freshRec2 = await Recipient.findById(recipient2.id);
    assert.equal(freshRec2.status, 'pending');

    // Set a fresh random token for signer 2's turn
    const token2Active = crypto.randomBytes(32).toString('hex');
    freshRec2.token_hash = hash(token2Active);
    await freshRec2.save();

    const info2Active = await signingService.getSigningInfo(token2Active);
    assert.equal(info2Active.status, 'pending');

    // Signer 2 signs -> Document reaches COMPLETED!
    const sign2Result = await signingService.submitSignature(token2Active, {
      signature: 'Typed: Signer Two',
      consent: true,
      fieldValues: {},
    });
    assert.equal(sign2Result.signed, true);
    assert.equal(sign2Result.complete, true);
    assert.ok(sign2Result.certificateId);

    // Verify document in DB is marked completed with signed filename and certificate
    const completedDoc = await Document.findById(testDoc.id);
    assert.equal(completedDoc.status, 'completed');
    assert.ok(completedDoc.signed_filename);
    assert.ok(completedDoc.certificate_id);
    assert.ok(completedDoc.final_sha256);
  });

  await t.test('Self-sign workflow allows owner to execute document directly', async () => {
    // Create another document for self-signing
    const doc2Id = uid();
    const doc2File = `${doc2Id}.pdf`;
    fs.writeFileSync(path.join(STORAGE_DIR, doc2File), pdfBuffer);

    const doc2 = await Document.create({
      _id: doc2Id,
      owner_id: testUser.id,
      name: 'Self Signed Waiver.pdf',
      filename: doc2File,
      mime: 'application/pdf',
      size: pdfBuffer.length,
      sha256: pdfService.sha256(pdfBuffer),
      status: 'draft',
      created: now(),
      updated: now(),
    });

    const selfSignResult = await signingService.selfSign({
      userId: testUser.id,
      documentId: doc2Id,
      signature: 'Typed: Workflow Tester',
      consent: true,
    });

    assert.equal(selfSignResult.signed, true);
    assert.equal(selfSignResult.complete, true);
    assert.ok(selfSignResult.certificateId);

    const verifiedDoc2 = await Document.findById(doc2Id);
    assert.equal(verifiedDoc2.status, 'completed');
    assert.ok(verifiedDoc2.signed_filename);

    // Clean up doc2
    await Document.deleteMany({ _id: doc2Id });
    try { fs.rmSync(path.join(STORAGE_DIR, doc2File), { force: true }); } catch {}
    try { fs.rmSync(path.join(STORAGE_DIR, `${doc2Id}_signed.pdf`), { force: true }); } catch {}
    try { fs.rmSync(path.join(STORAGE_DIR, `cert_${doc2Id}.pdf`), { force: true }); } catch {}
  });
});
