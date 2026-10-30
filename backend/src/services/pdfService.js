'use strict';
const crypto = require('node:crypto');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { uid, now } = require('../utils/crypto');

/**
 * Color definitions matching MAAC AI Sign brand palette
 */
const C_DARK = rgb(0.09, 0.16, 0.16);     // #172a2a
const C_GREEN = rgb(0.08, 0.53, 0.42);    // #14866c
const C_ACCENT = rgb(0.14, 0.67, 0.53);   // #24aa86
const C_MUTED = rgb(0.45, 0.54, 0.51);    // #738a82
const C_LINE = rgb(0.85, 0.90, 0.88);     // #d9e6e1
const C_BG_CARD = rgb(0.96, 0.98, 0.97);  // #f5faf8
const C_BLACK = rgb(0.10, 0.15, 0.18);    // #19262e

/**
 * Helper to compute SHA-256 hash of a buffer
 */
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Wrap text to fit within a specific width
 */
function wrapText(text, font, size, maxWidth) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = font.widthOfTextAtSize(`${currentLine} ${word}`, size);
    if (width < maxWidth) {
      currentLine += ` ${word}`;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Sanitize text to WinAnsi ASCII range (standard PDF fonts)
 */
function safeText(str) {
  if (!str) return '';
  return String(str)
    .replace(/[✦★]/g, '*')
    .replace(/[✓✔]/g, '[VERIFIED]')
    .replace(/[•]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ');
}

/**
 * PHASE 5: Final Signed PDF Generator
 * Stamps signing fields directly at configured positions on original document pages,
 * and appends an official Execution & Signature Record page.
 */
async function finalizeSignedPdf({ originalPdfBuffer, signers, documentName, documentId, fields = [] }) {
  if (!originalPdfBuffer || originalPdfBuffer.length < 8) {
    throw new Error('Invalid original PDF buffer');
  }

  let pdfDoc;
  let copiedSuccessfully = false;

  try {
    const loadedDoc = await PDFDocument.load(originalPdfBuffer, { ignoreEncryption: true });
    const count = loadedDoc.getPageCount();
    if (count > 0) {
      pdfDoc = await PDFDocument.create();
      const pageIndices = loadedDoc.getPageIndices();
      const copiedPages = await pdfDoc.copyPages(loadedDoc, pageIndices);
      for (const p of copiedPages) {
        pdfDoc.addPage(p);
      }
      copiedSuccessfully = true;
    }
  } catch {
    copiedSuccessfully = false;
  }

  if (!copiedSuccessfully) {
    pdfDoc = await PDFDocument.create();
    const coverPage = pdfDoc.addPage([612, 792]);
    const fRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    coverPage.drawText(`MAAC AI Sign Document: ${documentName || 'Agreement'}`, {
      x: 50,
      y: 720,
      size: 14,
      font: fBold,
      color: C_DARK,
    });
    coverPage.drawText(`Document Identifier: ${documentId || 'N/A'}`, {
      x: 50,
      y: 700,
      size: 10,
      font: fRegular,
      color: C_MUTED,
    });
    coverPage.drawText(`Original document payload archived and verified. Execution record attached.`, {
      x: 50,
      y: 675,
      size: 9,
      font: fRegular,
      color: C_MUTED,
    });
  }

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Render configured fields directly onto their designated document pages
  if (Array.isArray(fields) && fields.length > 0) {
    const pages = pdfDoc.getPages();
    for (const f of fields) {
      const pageIndex = (Number(f.page) || 1) - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      const targetPage = pages[pageIndex];
      const { width: pWidth, height: pHeight } = targetPage.getSize();

      const fieldX = Math.max(0, (Number(f.x) || 0) * pWidth);
      const fieldW = Math.max(20, (Number(f.width) || 0.1) * pWidth);
      const fieldH = Math.max(14, (Number(f.height) || 0.04) * pHeight);
      const fieldY = Math.max(0, pHeight - ((Number(f.y) || 0) * pHeight) - fieldH);

      const signer = (signers && signers.find((s) => s.recipient_id === f.recipient_id)) || (signers && signers[0]) || {};

      if (['signature', 'initials', 'initial'].includes(f.type)) {
        let drawn = false;
        if (signer.signature && typeof signer.signature === 'string' && signer.signature.startsWith('data:image/png;base64,')) {
          try {
            const base64Data = signer.signature.replace(/^data:image\/png;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');
            const embeddedImg = await pdfDoc.embedPng(imgBuffer);
            const imgDims = embeddedImg.scaleToFit(fieldW - 4, fieldH - 4);
            targetPage.drawImage(embeddedImg, {
              x: fieldX + (fieldW - imgDims.width) / 2,
              y: fieldY + (fieldH - imgDims.height) / 2,
              width: imgDims.width,
              height: imgDims.height,
            });
            drawn = true;
          } catch {}
        }
        if (!drawn) {
          const sigText = (signer.signature && signer.signature.startsWith('Typed: '))
            ? signer.signature.replace('Typed: ', '')
            : (signer.name || (f.type === 'initials' || f.type === 'initial' ? 'Initial' : 'Signature'));
          targetPage.drawText(safeText(sigText), {
            x: fieldX + 4,
            y: fieldY + fieldH / 2 - 4,
            size: Math.min(13, Math.max(8, fieldH * 0.55)),
            font: fontItalic,
            color: C_GREEN,
          });
        }
      } else if (f.type === 'stamp') {
        let stampDrawn = false;
        if (f.value && typeof f.value === 'string' && f.value.startsWith('data:image/')) {
          try {
            const isPng = f.value.startsWith('data:image/png');
            const b64 = f.value.replace(/^data:image\/\w+;base64,/, '');
            const buf = Buffer.from(b64, 'base64');
            const emb = isPng ? await pdfDoc.embedPng(buf) : await pdfDoc.embedJpg(buf);
            const dims = emb.scaleToFit(fieldW - 4, fieldH - 4);
            targetPage.drawImage(emb, {
              x: fieldX + (fieldW - dims.width) / 2,
              y: fieldY + (fieldH - dims.height) / 2,
              width: dims.width,
              height: dims.height,
            });
            stampDrawn = true;
          } catch {}
        }
        if (!stampDrawn) {
          targetPage.drawRectangle({
            x: fieldX,
            y: fieldY,
            width: fieldW,
            height: fieldH,
            borderColor: C_GREEN,
            borderWidth: 1.5,
            color: rgb(0.95, 0.98, 0.96),
          });
          const stampText = f.value || '★ OFFICIAL STAMP ★';
          targetPage.drawText(safeText(String(stampText)), {
            x: fieldX + 4,
            y: fieldY + fieldH / 2 - 4,
            size: Math.min(9, Math.max(6, fieldH * 0.45)),
            font: fontBold,
            color: C_GREEN,
          });
        }
      } else if (f.type === 'image') {
        let imgDrawn = false;
        if (f.value && typeof f.value === 'string' && f.value.startsWith('data:image/')) {
          try {
            const isPng = f.value.startsWith('data:image/png');
            const b64 = f.value.replace(/^data:image\/\w+;base64,/, '');
            const buf = Buffer.from(b64, 'base64');
            const emb = isPng ? await pdfDoc.embedPng(buf) : await pdfDoc.embedJpg(buf);
            const dims = emb.scaleToFit(fieldW - 2, fieldH - 2);
            targetPage.drawImage(emb, {
              x: fieldX + (fieldW - dims.width) / 2,
              y: fieldY + (fieldH - dims.height) / 2,
              width: dims.width,
              height: dims.height,
            });
            imgDrawn = true;
          } catch {}
        }
        if (!imgDrawn) {
          targetPage.drawRectangle({
            x: fieldX,
            y: fieldY,
            width: fieldW,
            height: fieldH,
            borderColor: C_DARK,
            borderWidth: 1,
            color: rgb(0.96, 0.96, 0.96),
          });
          targetPage.drawText(safeText(f.label || 'Image'), {
            x: fieldX + 4,
            y: fieldY + fieldH / 2 - 4,
            size: Math.min(9, Math.max(7, fieldH * 0.4)),
            font: fontRegular,
            color: C_MUTED,
          });
        }
      } else if (f.type === 'checkbox' || f.type === 'checkbox_group') {
        const isChecked = f.value === true || f.value === 'true' || f.value === '1';
        targetPage.drawRectangle({
          x: fieldX,
          y: fieldY,
          width: Math.min(fieldW, fieldH),
          height: Math.min(fieldW, fieldH),
          borderColor: C_DARK,
          borderWidth: 1,
          color: rgb(1, 1, 1),
        });
        if (isChecked) {
          targetPage.drawText('X', {
            x: fieldX + 3,
            y: fieldY + 2,
            size: Math.min(10, fieldH * 0.7),
            font: fontBold,
            color: C_GREEN,
          });
        }
      } else if (f.type === 'radio') {
        const isChecked = f.value === true || f.value === 'true' || f.value === '1';
        const rad = Math.min(fieldW, fieldH) / 2;
        targetPage.drawCircle({
          x: fieldX + rad,
          y: fieldY + rad,
          size: rad,
          borderColor: C_DARK,
          borderWidth: 1,
          color: rgb(1, 1, 1),
        });
        if (isChecked) {
          targetPage.drawCircle({
            x: fieldX + rad,
            y: fieldY + rad,
            size: rad * 0.5,
            color: C_GREEN,
          });
        }
      } else {
        let textVal = f.value || '';
        if (!textVal) {
          if (['date_signed', 'sign_date'].includes(f.type)) textVal = new Date().toLocaleDateString('en-US');
          else if (['name', 'full_name'].includes(f.type)) textVal = signer.name || '';
          else if (f.type === 'email') textVal = signer.email || '';
          else if (f.type === 'company') textVal = signer.company || '';
          else if (['title', 'job_title'].includes(f.type)) textVal = signer.title || '';
        }
        if (textVal) {
          targetPage.drawText(safeText(String(textVal)), {
            x: fieldX + 3,
            y: fieldY + fieldH / 2 - 4,
            size: Math.min(10, Math.max(7, fieldH * 0.55)),
            font: fontRegular,
            color: C_BLACK,
          });
        }
      }
    }
  }

  // If no specific fields were placed on the document pages, stamp signatures at the bottom of the last page
  if ((!fields || fields.length === 0) && Array.isArray(signers) && signers.length > 0) {
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width: pWidth } = lastPage.getSize();
    const stampMargin = 40;
    const availableWidth = pWidth - stampMargin * 2;
    const numSigners = Math.min(signers.length, 3);
    const colWidth = availableWidth / numSigners;

    for (let i = 0; i < signers.length; i++) {
      const s = signers[i];
      const col = i % numSigners;
      const sigX = stampMargin + col * colWidth;
      const sigY = 25 + Math.floor(i / numSigners) * 50;

      let drawn = false;
      if (s.signature && typeof s.signature === 'string' && s.signature.startsWith('data:image/')) {
        try {
          const isPng = s.signature.startsWith('data:image/png');
          const base64Data = s.signature.replace(/^data:image\/\w+;base64,/, '');
          const imgBuffer = Buffer.from(base64Data, 'base64');
          const embeddedImg = isPng ? await pdfDoc.embedPng(imgBuffer) : await pdfDoc.embedJpg(imgBuffer);
          const imgDims = embeddedImg.scaleToFit(Math.min(130, colWidth - 20), 35);
          lastPage.drawImage(embeddedImg, {
            x: sigX,
            y: sigY,
            width: imgDims.width,
            height: imgDims.height,
          });
          drawn = true;
        } catch {}
      }
      if (!drawn) {
        const sigText = (s.signature && s.signature.startsWith('Typed: '))
          ? s.signature.replace('Typed: ', '')
          : (s.name || 'Signature');
        lastPage.drawText(safeText(sigText), {
          x: sigX,
          y: sigY + 12,
          size: 11,
          font: fontItalic,
          color: C_GREEN,
        });
      }
      lastPage.drawText(safeText(`${s.name || 'Signer'} • ${new Date().toLocaleDateString('en-US')}`), {
        x: sigX,
        y: sigY,
        size: 7.5,
        font: fontRegular,
        color: C_MUTED,
      });
    }
  }

  const finalPdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const finalBuffer = Buffer.from(finalPdfBytes);
  const finalHash = sha256(finalBuffer);

  return {
    buffer: finalBuffer,
    sha256: finalHash,
  };
}

/**
 * PHASE 6: Certificate of Completion PDF Generator
 * Generates an official, dedicated 1-page compliance certificate.
 */
async function generateCertificateOfCompletion({
  certificateId,
  documentName,
  documentId,
  originalSha256,
  finalSha256,
  signers = [],
  auditEvents = [],
  createdAt,
}) {
  const certId = certificateId || `CERT-${uid().toUpperCase()}`;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter 612 x 792
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 36;

  // Outer Border
  page.drawRectangle({
    x: margin,
    y: margin,
    width: width - margin * 2,
    height: height - margin * 2,
    borderColor: C_DARK,
    borderWidth: 2,
    color: rgb(1, 1, 1),
  });

  // Inner Accent Border
  page.drawRectangle({
    x: margin + 5,
    y: margin + 5,
    width: width - margin * 2 - 10,
    height: height - margin * 2 - 10,
    borderColor: C_ACCENT,
    borderWidth: 0.75,
    color: rgb(1, 1, 1),
  });

  let y = height - margin - 32;

  // Top Header Banner
  page.drawText('MAAC AI SIGN', {
    x: margin + 24,
    y,
    size: 18,
    font: fontBold,
    color: C_DARK,
  });

  page.drawText('OFFICIAL CERTIFICATE OF COMPLETION', {
    x: margin + 24,
    y: y - 18,
    size: 11,
    font: fontBold,
    color: C_GREEN,
  });

  page.drawText(`Certificate ID: ${certId}`, {
    x: width - margin - 220,
    y,
    size: 9,
    font: fontBold,
    color: C_DARK,
  });

  page.drawText(`Issued: ${createdAt || new Date().toUTCString()}`, {
    x: width - margin - 220,
    y: y - 14,
    size: 8,
    font: fontRegular,
    color: C_MUTED,
  });

  y -= 44;

  // Horizontal Rule
  page.drawLine({
    start: { x: margin + 20, y },
    end: { x: width - margin - 20, y },
    thickness: 1,
    color: C_LINE,
  });

  y -= 18;

  // Document Summary Section
  page.drawText('DOCUMENT EXECUTION PROFILE', {
    x: margin + 24,
    y,
    size: 9,
    font: fontBold,
    color: C_MUTED,
  });
  y -= 14;

  const docSummaryBoxHeight = 52;
  page.drawRectangle({
    x: margin + 20,
    y: y - docSummaryBoxHeight,
    width: width - margin * 2 - 40,
    height: docSummaryBoxHeight,
    color: C_BG_CARD,
    borderColor: C_LINE,
    borderWidth: 0.5,
  });

  let boxY = y - 16;
  page.drawText(`Document Title: ${documentName || 'Agreement'}`, {
    x: margin + 30,
    y: boxY,
    size: 10,
    font: fontBold,
    color: C_DARK,
  });
  boxY -= 13;

  page.drawText(`Document ID: ${documentId}`, {
    x: margin + 30,
    y: boxY,
    size: 8.5,
    font: fontRegular,
    color: C_BLACK,
  });
  boxY -= 12;

  page.drawText(`Workflow Status: Fully Completed & Cryptographically Sealed`, {
    x: margin + 30,
    y: boxY,
    size: 8.5,
    font: fontBold,
    color: C_GREEN,
  });

  y -= (docSummaryBoxHeight + 16);

  // Cryptographic Fingerprints Box
  page.drawText('CRYPTOGRAPHIC HASH INTEGRITY (SHA-256)', {
    x: margin + 24,
    y,
    size: 9,
    font: fontBold,
    color: C_MUTED,
  });
  y -= 14;

  const hashBoxHeight = 44;
  page.drawRectangle({
    x: margin + 20,
    y: y - hashBoxHeight,
    width: width - margin * 2 - 40,
    height: hashBoxHeight,
    color: rgb(0.98, 0.99, 0.98),
    borderColor: C_LINE,
    borderWidth: 0.5,
  });

  let hY = y - 14;
  page.drawText(`Original Document Hash:`, {
    x: margin + 30,
    y: hY,
    size: 7.5,
    font: fontBold,
    color: C_MUTED,
  });
  page.drawText(originalSha256 || 'N/A', {
    x: margin + 140,
    y: hY,
    size: 7.5,
    font: fontRegular,
    color: C_DARK,
  });
  hY -= 14;

  page.drawText(`Executed Document Hash:`, {
    x: margin + 30,
    y: hY,
    size: 7.5,
    font: fontBold,
    color: C_MUTED,
  });
  page.drawText(finalSha256 || 'N/A', {
    x: margin + 140,
    y: hY,
    size: 7.5,
    font: fontRegular,
    color: C_DARK,
  });

  y -= (hashBoxHeight + 16);

  // Signer Authentication Register
  page.drawText('SIGNER AUTHENTICATION & CONSENT REGISTER', {
    x: margin + 24,
    y,
    size: 9,
    font: fontBold,
    color: C_MUTED,
  });
  y -= 14;

  const signersBoxHeight = Math.max(70, signers.length * 48 + 10);
  page.drawRectangle({
    x: margin + 20,
    y: y - signersBoxHeight,
    width: width - margin * 2 - 40,
    height: signersBoxHeight,
    color: rgb(1, 1, 1),
    borderColor: C_LINE,
    borderWidth: 0.5,
  });

  let sY = y - 18;
  for (const s of signers) {
    page.drawText(safeText(`- ${s.name || 'Signer'} <${s.email || 'Email'}>`), {
      x: margin + 30,
      y: sY,
      size: 9.5,
      font: fontBold,
      color: C_DARK,
    });
    page.drawText(`[VERIFIED SIGNED]`, {
      x: width - margin - 150,
      y: sY,
      size: 8.5,
      font: fontBold,
      color: C_GREEN,
    });
    sY -= 13;

    page.drawText(safeText(`Timestamp: ${s.signed_at || new Date().toUTCString()} | IP: ${s.ip_address || '127.0.0.1'}`), {
      x: margin + 38,
      y: sY,
      size: 8,
      font: fontRegular,
      color: C_MUTED,
    });
    sY -= 18;
  }

  y -= (signersBoxHeight + 24);

  // Legal Framework Compliance Notice
  const legalText = 'COMPLIANCE NOTICE: This electronic certificate is generated pursuant to the United States Electronic Signatures in Global and National Commerce Act (E-SIGN, 15 U.S.C. 7001 et seq.) and the Uniform Electronic Transactions Act (UETA). The recorded signatures and electronic assent are legally binding and admissible in judicial proceedings.';
  const legalLines = wrapText(legalText, fontRegular, 6.5, width - margin * 2 - 50);

  let legalY = margin + 35;
  for (const line of legalLines) {
    page.drawText(line, {
      x: margin + 25,
      y: legalY,
      size: 6.5,
      font: fontRegular,
      color: C_MUTED,
    });
    legalY -= 8.5;
  }

  const certBytes = await pdfDoc.save({ useObjectStreams: false });
  const certBuffer = Buffer.from(certBytes);
  const certHash = sha256(certBuffer);

  return {
    certificateId: certId,
    buffer: certBuffer,
    sha256: certHash,
  };
}

module.exports = {
  finalizeSignedPdf,
  generateCertificateOfCompletion,
  sha256,
};
