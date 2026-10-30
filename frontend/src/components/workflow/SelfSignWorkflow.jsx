import { useState, useRef, useEffect } from 'react';
import { documentService } from '../../services/documentService.js';
import { toast } from '../common/Toast.jsx';

/**
 * SelfSignWorkflow — allows the authenticated user to upload a PDF, sign it
 * themselves, and save the completed result without external recipients.
 */
export function SelfSignWorkflow({ docs: initialDocs, onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1=choose doc, 2=sign
  const [docs, setDocs] = useState(initialDocs || []);
  const [docId, setDocId] = useState('');
  const [docName, setDocName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [mode, setMode] = useState('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef();

  // Signing state
  const [signType, setSignType] = useState('type'); // 'type' | 'draw' | 'upload'
  const [typedName, setTypedName] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [removeBg, setRemoveBg] = useState(true);
  const rawFileRef = useRef(null);
  const uploadInputRef = useRef(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signError, setSignError] = useState('');
  const [completed, setCompleted] = useState(false);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  const handleSignatureUpload = (file, shouldRemoveBg = removeBg) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSignError('Please choose a valid image file');
      return;
    }
    rawFileRef.current = file;
    setUploadedFileName(file.name);
    setSignError('');

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 600;
        const maxH = 200;
        let w = img.width;
        let h = img.height;

        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        if (shouldRemoveBg) {
          const imgData = ctx.getImageData(0, 0, w, h);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            if (r > 215 && g > 215 && b > 215) {
              d[i + 3] = 0;
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        const dataUrl = canvas.toDataURL('image/png');
        setUploadedImage(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    documentService.list().then(setDocs).catch(() => {});
  }, []);

  // Canvas drawing
  useEffect(() => {
    if (signType !== 'draw' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#123e35';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      return [
        ((e.clientX - rect.left) * canvas.width) / rect.width,
        ((e.clientY - rect.top) * canvas.height) / rect.height,
      ];
    }

    const onDown = (e) => { drawingRef.current = true; canvas.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); };
    const onMove = (e) => { if (drawingRef.current) { ctx.lineTo(...pos(e)); ctx.stroke(); } };
    const onUp = () => { drawingRef.current = false; };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
    };
  }, [signType, step]);

  const clearCanvas = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const handleFileSelect = (f) => {
    if (!f) return;
    if (f.size > 6 * 1024 * 1024) { setUploadError('File exceeds 6 MB limit'); return; }
    setUploadFile(f);
    setUploadError('');
    if (!uploadName) setUploadName(f.name.replace(/\.pdf$/i, ''));
  };

  const handleDocUploadOrSelect = async () => {
    if (mode === 'select') {
      if (!docId) { setUploadError('Please select a document'); return; }
      const d = docs.find((x) => x.id === docId);
      setDocName(d?.name || 'Document');
      setStep(2);
      return;
    }

    if (!uploadFile) { setUploadError('Please choose a PDF file'); return; }
    if (!uploadName.trim()) { setUploadError('Document name is required'); return; }

    setUploading(true);
    setUploadError('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });
      const result = await documentService.upload({ name: uploadName.trim(), base64 });
      setDocId(result.id);
      setDocName(uploadName.trim());
      toast('Document uploaded');
      setStep(2);
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSign = async () => {
    if (!consent) { setSignError('Please accept the electronic signature agreement'); return; }

    let sigData = '';
    if (signType === 'type') {
      if (!typedName.trim()) { setSignError('Please type your name'); return; }
      sigData = `Typed: ${typedName.trim()}`;
    } else if (signType === 'upload') {
      if (!uploadedImage) { setSignError('Please upload or choose a signature image from your gallery'); return; }
      sigData = uploadedImage;
    } else {
      if (!canvasRef.current) return;
      sigData = canvasRef.current.toDataURL('image/png');
    }

    setSubmitting(true);
    setSignError('');
    try {
      await fetch(`/api/documents/${docId}/self-sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ signature: sigData, signatureType: signType, consent: true }),
      }).then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `Failed (${r.status})`);
        }
        return r.json();
      });
      setCompleted(true);
      toast('Document signed and sealed successfully!');
      onSuccess?.();
    } catch (err) {
      setSignError(err.message || 'Failed to sign document');
    } finally {
      setSubmitting(false);
    }
  };

  if (completed) {
    return (
      <div className="wiz-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="wiz-panel">
          <button className="wiz-close" onClick={onClose}>✕</button>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
            <h2 style={{ margin: '0 0 8px', color: 'var(--accent)' }}>Document Signed!</h2>
            <p style={{ color: 'var(--muted)', marginBottom: '20px' }}>"{docName}" has been signed and the finalized PDF is ready in your Documents.</p>
            <div className="btngroup" style={{ justifyContent: 'center' }}>
              <a href="/api/documents" className="btn primary" onClick={onClose}>View Documents</a>
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wiz-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wiz-panel">
        <button className="wiz-close" onClick={onClose}>✕</button>

        {step === 1 && (
          <div className="wiz-body">
            <h2 className="wiz-title">Sign Yourself</h2>
            <p className="dialognote">Upload a PDF or choose an existing document to sign without sending to others.</p>

            <div className="wiz-tabs">
              <button className={`wiz-tab${mode === 'upload' ? ' active' : ''}`} onClick={() => setMode('upload')}>Upload PDF</button>
              <button className={`wiz-tab${mode === 'select' ? ' active' : ''}`} onClick={() => setMode('select')}>Use existing draft</button>
            </div>

            {mode === 'upload' && (
              <>
                <div
                  className={`filedrop${isDragging ? ' dragging' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileSelect(e.dataTransfer.files[0]); }}
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="filedrop-icon">▤</div>
                  {uploadFile ? (
                    <>
                      <strong>{uploadFile.name}</strong>
                      <small>Ready to upload</small>
                    </>
                  ) : (
                    <>
                      <strong>Drag & drop PDF here</strong>
                      <small>or click to browse — max 6 MB</small>
                    </>
                  )}
                  <input ref={fileRef} type="file" accept="application/pdf" onChange={(e) => handleFileSelect(e.target.files[0])} style={{ display: 'none' }} />
                </div>
                <div className="formfield" style={{ marginTop: '12px' }}>
                  <label>Document name</label>
                  <input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="Document name" maxLength={150} />
                </div>
              </>
            )}

            {mode === 'select' && (
              <div className="formfield" style={{ marginTop: '8px' }}>
                <label>Select draft document</label>
                <select value={docId} onChange={(e) => setDocId(e.target.value)}>
                  <option value="">Choose a document…</option>
                  {docs.filter((d) => d.status === 'draft').map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}

            {uploadError && <p style={{ color: '#b33232', fontSize: '12px', margin: '8px 0' }}>{uploadError}</p>}

            <div className="btngroup" style={{ marginTop: '16px' }}>
              <button className="btn primary" onClick={handleDocUploadOrSelect} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Continue →'}
              </button>
              <button className="btn" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wiz-body">
            <h2 className="wiz-title">Sign Document</h2>
            <div className="card" style={{ marginBottom: '16px', padding: '12px 16px' }}>
              <span className="smallmuted">DOCUMENT: </span><strong>{docName}</strong>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button className={`chip ${signType === 'type' ? 'active' : ''}`} onClick={() => setSignType('type')}>Type signature</button>
              <button className={`chip ${signType === 'draw' ? 'active' : ''}`} onClick={() => setSignType('draw')}>Draw signature</button>
              <button className={`chip ${signType === 'upload' ? 'active' : ''}`} onClick={() => setSignType('upload')}>🖼 Upload signature image</button>
            </div>

            {signType === 'type' && (
              <div>
                <div className="formfield">
                  <label>Full Legal Name</label>
                  <input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Type your name" />
                </div>
                {typedName && (
                  <div style={{ background: '#f9fbfa', border: '1px solid #dfe9e4', borderRadius: '10px', padding: '18px 24px', fontFamily: 'cursive, "Brush Script MT", sans-serif', fontSize: '28px', color: '#123e35', letterSpacing: '1px', margin: '12px 0' }}>
                    {typedName}
                  </div>
                )}
              </div>
            )}

            {signType === 'draw' && (
              <div>
                <p className="dialognote">Draw your signature with finger or mouse.</p>
                <canvas ref={canvasRef} width={560} height={160} className="signature-pad" />
                <button type="button" className="link" onClick={clearCanvas} style={{ marginTop: '6px' }}>Clear</button>
              </div>
            )}

            {signType === 'upload' && (
              <div>
                <p className="dialognote">Upload a photo of your signature or select one from your gallery.</p>
                {!uploadedImage ? (
                  <div
                    className="filedrop"
                    onClick={() => uploadInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.[0]) handleSignatureUpload(e.dataTransfer.files[0]);
                    }}
                    style={{ cursor: 'pointer', padding: '30px 20px', textAlign: 'center', background: '#fafcfb', border: '1.5px dashed #b7c8c0', borderRadius: '10px' }}
                  >
                    <div className="filedrop-icon" style={{ fontSize: '32px', marginBottom: '8px' }}>🖼</div>
                    <strong>Click to select from gallery or files</strong>
                    <small style={{ color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                      or drag & drop signature image here (PNG, JPG, WEBP, or SVG)
                    </small>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleSignatureUpload(e.target.files[0]);
                      }}
                      style={{ display: 'none' }}
                    />
                  </div>
                ) : (
                  <div>
                    <div
                      style={{
                        background: '#ffffff',
                        border: '2px dashed #14866c',
                        borderRadius: '10px',
                        padding: '20px',
                        textAlign: 'center',
                        minHeight: '130px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                      }}
                    >
                      <img
                        src={uploadedImage}
                        alt="Uploaded signature"
                        style={{ maxHeight: '110px', maxWidth: '100%', objectFit: 'contain' }}
                      />
                      <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--green)', fontWeight: 600 }}>
                        ✓ {uploadedFileName || 'Signature image ready'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', flexWrap: 'wrap', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer', color: 'var(--ink)' }}>
                        <input
                          type="checkbox"
                          checked={removeBg}
                          onChange={(e) => {
                            setRemoveBg(e.target.checked);
                            if (rawFileRef.current) handleSignatureUpload(rawFileRef.current, e.target.checked);
                          }}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--green)' }}
                        />
                        <span>Transparent background (remove white paper background)</span>
                      </label>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn"
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                          onClick={() => uploadInputRef.current?.click()}
                        >
                          Choose different image
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{ fontSize: '12px', padding: '6px 12px', color: '#b33232', borderColor: '#b33232' }}
                          onClick={() => { setUploadedImage(null); setUploadedFileName(''); }}
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        ref={uploadInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files?.[0]) handleSignatureUpload(e.target.files[0], removeBg);
                        }}
                        style={{ display: 'none' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ margin: '20px 0 14px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', cursor: 'pointer', lineHeight: '1.6' }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: '18px', height: '18px', marginTop: '2px' }} />
                <span>I agree that my electronic signature has the same legal validity as a handwritten signature.</span>
              </label>
            </div>

            {signError && <p style={{ color: '#b33232', fontSize: '13px', margin: '8px 0' }}>{signError}</p>}

            <div className="btngroup">
              <button className="btn primary" onClick={handleSign} disabled={submitting || !consent}>
                {submitting ? 'Signing…' : '✒ Sign & Complete'}
              </button>
              <button className="btn" onClick={() => setStep(1)} disabled={submitting}>← Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SelfSignWorkflow;
