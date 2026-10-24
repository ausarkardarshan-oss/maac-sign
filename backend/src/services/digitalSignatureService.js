'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const env = require('../config/env');

/**
 * Check if cryptographic digital signing is configured with external certificates
 */
function isDigitalSigningConfigured() {
  if (!env.SIGNING_CERT_PATH || !env.SIGNING_KEY_PATH) return false;
  return fs.existsSync(env.SIGNING_CERT_PATH) && fs.existsSync(env.SIGNING_KEY_PATH);
}

/**
 * Read and inspect X.509 certificate details if configured
 */
function getCertificateDetails(certPem) {
  try {
    const cert = new crypto.X509Certificate(certPem);
    const now = new Date();
    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);
    const isExpired = now > validTo;
    const isNotYetValid = now < validFrom;
    const isSelfSigned = cert.issuer === cert.subject;

    return {
      subject: cert.subject,
      issuer: cert.issuer,
      validFrom: cert.validFrom,
      validTo: cert.validTo,
      serialNumber: cert.serialNumber,
      fingerprint256: cert.fingerprint256,
      isValid: !isExpired && !isNotYetValid,
      isSelfSigned,
      trustLevel: isSelfSigned
        ? 'SELF_SIGNED (Development / Sandbox Only — Not recognized by Adobe AATL)'
        : 'CA_ISSUED (Requires Adobe AATL or eIDAS Trusted List recognition)',
    };
  } catch (err) {
    return {
      isValid: false,
      error: `Certificate parse error: ${err.message}`,
    };
  }
}

/**
 * Generate a self-signed test keypair for local development/testing.
 * (Disclosed clearly as development only; never used to claim commercial trust)
 */
function generateDevelopmentKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return { privateKey, publicKey };
}

/**
 * Sign a PDF buffer cryptographically using SHA-256 with RSA private key.
 * Produces a cryptographic integrity seal attached to the document metadata and audit store.
 */
function signPdfCryptographically(pdfBuffer, options = {}) {
  let privateKeyPem;
  let certificatePem = null;
  let isDevKey = false;

  if (isDigitalSigningConfigured()) {
    privateKeyPem = fs.readFileSync(env.SIGNING_KEY_PATH, 'utf8');
    certificatePem = fs.readFileSync(env.SIGNING_CERT_PATH, 'utf8');
  } else if (options.privateKeyPem) {
    privateKeyPem = options.privateKeyPem;
    certificatePem = options.certificatePem || null;
  } else {
    // Generate an in-memory development keypair for local cryptographic verification
    const devKeys = generateDevelopmentKeyPair();
    privateKeyPem = devKeys.privateKey;
    certificatePem = devKeys.publicKey;
    isDevKey = true;
  }

  // Compute canonical document digest
  const documentDigest = crypto.createHash('sha256').update(pdfBuffer).digest();
  const documentHashHex = documentDigest.toString('hex');

  // Sign document digest with private key (RSASSA-PKCS1-v1_5 SHA-256)
  const signer = crypto.createSign('SHA256');
  signer.update(pdfBuffer);
  signer.end();

  const signatureBuffer = signer.sign({
    key: privateKeyPem,
    passphrase: env.SIGNING_PASSPHRASE || undefined,
  });
  const signatureHex = signatureBuffer.toString('hex');

  let certDetails = null;
  if (certificatePem && !isDevKey) {
    certDetails = getCertificateDetails(certificatePem);
  } else {
    certDetails = {
      subject: 'CN=MAAC AI Sign Development Sandbox, O=MAAC AI Sign',
      issuer: 'CN=MAAC AI Sign Development Sandbox, O=MAAC AI Sign',
      isSelfSigned: true,
      trustLevel: 'SELF_SIGNED (Development / Sandbox Only — Not recognized by Adobe AATL)',
    };
  }

  return {
    algorithm: 'RSA-SHA256',
    documentHash: documentHashHex,
    signatureHex,
    signatureBase64: signatureBuffer.toString('base64'),
    timestamp: new Date().toISOString(),
    isDevelopmentKey: isDevKey,
    certificate: certDetails,
    publicKeyPem: isDevKey ? certificatePem : undefined,
  };
}

/**
 * Verify a cryptographic digital signature against a PDF buffer and public key / certificate.
 */
function verifyPdfDigitalSignature(pdfBuffer, { signatureHex, publicKeyPem, algorithm = 'SHA256' }) {
  if (!signatureHex || !publicKeyPem) {
    return {
      verified: false,
      error: 'Missing signatureHex or publicKeyPem for verification',
    };
  }

  try {
    const verifier = crypto.createVerify(algorithm);
    verifier.update(pdfBuffer);
    verifier.end();

    const signatureBuffer = Buffer.from(signatureHex, 'hex');
    const isValid = verifier.verify(publicKeyPem, signatureBuffer);

    const currentHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    return {
      verified: isValid,
      currentHash,
      tampered: !isValid,
      message: isValid
        ? 'Cryptographic integrity verified. Document has not been altered since execution.'
        : 'FAILED: Digital signature does not match document content. Document has been modified or corrupted.',
    };
  } catch (err) {
    return {
      verified: false,
      error: `Verification error: ${err.message}`,
    };
  }
}

module.exports = {
  isDigitalSigningConfigured,
  getCertificateDetails,
  generateDevelopmentKeyPair,
  signPdfCryptographically,
  verifyPdfDigitalSignature,
};
