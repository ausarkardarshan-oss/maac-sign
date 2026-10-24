'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const emailService = require('../src/services/emailService');
const pdfService = require('../src/services/pdfService');
const digitalSignatureService = require('../src/services/digitalSignatureService');

test('Phase 2: Brevo SMTP Service and Templates', async (t) => {
  await t.test('maskEmail properly masks email addresses', () => {
    assert.equal(emailService.maskEmail('darshan@example.com'), 'd***n@example.com');
    assert.equal(emailService.maskEmail('a@b.com'), '***@b.com');
    assert.equal(emailService.maskEmail(''), 'unknown');
  });

  await t.test('verifySmtpConnection returns structured health status', async () => {
    const health = await emailService.verifySmtpConnection();
    assert.ok(typeof health === 'object');
    assert.ok('configured' in health);
    assert.ok('connected' in health);
  });

  await t.test('sendSigningInvitation renders and delivers or simulates safely', async () => {
    const res = await emailService.sendSigningInvitation({
      recipientEmail: 'client@example.com',
      recipientName: 'Client Recipient',
      senderName: 'Darshan Ausarkar',
      documentName: 'Master Services Agreement.pdf',
      subject: 'Please review and execute',
      invitationUrl: 'http://localhost:5173/sign/1234567890abcdef1234567890abcdef',
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });
    assert.ok(res.messageId, 'Message ID or simulated ID should be returned');
  });

  await t.test('sendCompletionNotification renders and delivers or simulates safely', async () => {
    const res = await emailService.sendCompletionNotification({
      recipientEmail: 'client@example.com',
      recipientName: 'Client Recipient',
      documentName: 'Master Services Agreement.pdf',
      downloadUrl: 'http://localhost:5173/documents',
      certificateUrl: 'http://localhost:5173/documents',
      isSender: false,
    });
    assert.ok(res.messageId);
  });
});

test('Phase 5 & 6: PDF Processing and Certificate Generation', async (t) => {
  // Create a minimal valid PDF using pdf-lib
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const baseDoc = await PDFDocument.create();
  const page = baseDoc.addPage([612, 792]);
  const font = await baseDoc.embedFont(StandardFonts.Helvetica);
  page.drawText('Sample Contract Body Text', { x: 50, y: 700, size: 12, font });
  const originalBytes = Buffer.from(await baseDoc.save());

  await t.test('finalizeSignedPdf stamps signature execution page and preserves original', async () => {
    const signers = [
      {
        name: 'Darshan Ausarkar',
        email: 'darshan@example.com',
        signed_at: new Date().toUTCString(),
        ip_address: '192.168.1.50',
        signature: 'Typed: Darshan Ausarkar',
        signature_type: 'type',
        consent_recorded: true,
      },
    ];

    const result = await pdfService.finalizeSignedPdf({
      originalPdfBuffer: originalBytes,
      signers,
      documentName: 'Sample Contract',
      documentId: 'doc_12345',
    });

    assert.ok(result.buffer instanceof Buffer, 'Final buffer should be generated');
    assert.ok(result.buffer.length > originalBytes.length, 'Final PDF should include signature record');
    assert.equal(typeof result.sha256, 'string', 'SHA-256 hash should be hex string');
    assert.equal(result.sha256.length, 64, 'SHA-256 hash should be 64 characters');
  });

  await t.test('generateCertificateOfCompletion creates compliance certificate PDF', async () => {
    const signers = [
      {
        name: 'Darshan Ausarkar',
        email: 'darshan@example.com',
        signed_at: new Date().toUTCString(),
        ip_address: '192.168.1.50',
        signature_type: 'type',
        consent_recorded: true,
      },
    ];

    const cert = await pdfService.generateCertificateOfCompletion({
      certificateId: 'CERT-TEST-999',
      documentName: 'Non-Disclosure Agreement',
      documentId: 'doc_999',
      originalSha256: pdfService.sha256(originalBytes),
      finalSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      signers,
      auditEvents: [
        { at: new Date().toISOString(), action: 'uploaded', actor: 'owner@example.com', entry_hash: '123' },
        { at: new Date().toISOString(), action: 'recipient_signed', actor: 'client@example.com', entry_hash: '456' },
      ],
      createdAt: new Date().toUTCString(),
    });

    assert.equal(cert.certificateId, 'CERT-TEST-999');
    assert.ok(cert.buffer.length > 500, 'Certificate PDF should have content');
    assert.equal(cert.sha256.length, 64);
  });
});

test('Phase 7: Certificate-Based PDF Digital Signatures', async (t) => {
  const dummyPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

  await t.test('signPdfCryptographically produces valid RSA-SHA256 signature seal', () => {
    const seal = digitalSignatureService.signPdfCryptographically(dummyPdf);

    assert.equal(seal.algorithm, 'RSA-SHA256');
    assert.equal(typeof seal.signatureHex, 'string');
    assert.ok(seal.signatureHex.length > 100);
    assert.equal(typeof seal.documentHash, 'string');
    assert.equal(seal.documentHash.length, 64);
    assert.ok(seal.certificate);

    // Verify signature
    const verification = digitalSignatureService.verifyPdfDigitalSignature(dummyPdf, {
      signatureHex: seal.signatureHex,
      publicKeyPem: seal.publicKeyPem,
    });
    assert.equal(verification.verified, true, 'Original PDF signature must verify successfully');
    assert.equal(verification.tampered, false);

    // Tamper detection: change 1 byte
    const tamperedPdf = Buffer.from(dummyPdf);
    tamperedPdf[tamperedPdf.length - 1] = 0x20; // alter byte

    const tamperedVerification = digitalSignatureService.verifyPdfDigitalSignature(tamperedPdf, {
      signatureHex: seal.signatureHex,
      publicKeyPem: seal.publicKeyPem,
    });
    assert.equal(tamperedVerification.verified, false, 'Tampered PDF must fail signature verification');
    assert.equal(tamperedVerification.tampered, true);
  });
});

test('Phase 4 & 8: Token Security and Edge Case Handling', async (t) => {
  const { connectDB, disconnectDB } = require('../src/config/database');
  const signingService = require('../src/services/signingService');

  t.before(async () => {
    await connectDB();
  });

  t.after(async () => {
    await disconnectDB();
  });

  await t.test('getSigningInfo rejects malformed tokens', async () => {
    await assert.rejects(
      () => signingService.getSigningInfo('short_bad_token'),
      /Invalid or malformed invitation link/
    );
  });

  await t.test('getSigningInfo rejects non-existent 64-char token hashes', async () => {
    await assert.rejects(
      () => signingService.getSigningInfo('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
      /Signing invitation not found or link has expired/
    );
  });
});

