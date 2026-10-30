import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { signingService } from '../../services/signingService.js';
import { toast } from '../../components/common/Toast.jsx';

export function SigningPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Signature state
  const [signType, setSignType] = useState('type'); // 'type' | 'draw' | 'upload'
  const [typedName, setTypedName] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [removeBg, setRemoveBg] = useState(true);
  const rawFileRef = useRef(null);
  const uploadInputRef = useRef(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [fieldValues, setFieldValues] = useState({});

  // Canvas ref
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  const handleSignatureUpload = (file, shouldRemoveBg = removeBg) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please choose a valid image file (PNG, JPG, WEBP, etc.)');
      return;
    }
    rawFileRef.current = file;
    setUploadedFileName(file.name);

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
    signingService
      .getSigningInfo(token)
      .then((data) => {
        setInfo(data);
        if (data.recipient) setTypedName(data.recipient);
        if (data.status === 'signed' || data.status === 'completed') {
          setCompleted(true);
        }

        // Initialize field values
        if (Array.isArray(data.fields) && data.fields.length > 0) {
          const initial = {};
          const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          data.fields.forEach((f) => {
            if (f.value !== undefined && f.value !== null) {
              initial[f.id] = f.value;
            } else if (f.type === 'name') {
              initial[f.id] = data.recipient || '';
            } else if (f.type === 'email') {
              initial[f.id] = data.email || '';
            } else if (f.type === 'date_signed') {
              initial[f.id] = today;
            } else if (f.type === 'checkbox') {
              initial[f.id] = false;
            } else {
              initial[f.id] = '';
            }
          });
          setFieldValues(initial);
        }
      })
      .catch((err) => {
        setError(err.message || 'Invalid or expired signing link');
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Setup canvas drawing handlers
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

    const onPointerDown = (e) => {
      drawingRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      ctx.beginPath();
      ctx.moveTo(...pos(e));
    };

    const onPointerMove = (e) => {
      if (drawingRef.current) {
        ctx.lineTo(...pos(e));
        ctx.stroke();
      }
    };

    const onPointerUp = () => {
      drawingRef.current = false;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
  }, [signType]);

  const clearCanvas = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const handleFieldChange = (fieldId, value) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!consent) {
      toast('Please accept the signature agreement');
      return;
    }

    // Validate required fields
    if (info?.fields && Array.isArray(info.fields)) {
      for (const f of info.fields) {
        if (f.required && f.type !== 'signature' && f.type !== 'date_signed') {
          const val = fieldValues[f.id];
          if (f.type === 'checkbox' && !val) {
            toast(`Please check the required box: "${f.label || 'Checkbox'}"`);
            return;
          }
          if (f.type !== 'checkbox' && (!val || !String(val).trim())) {
            toast(`Please fill out the required field: "${f.label || f.type}"`);
            return;
          }
        }
      }
    }

    let sigData = '';
    if (signType === 'type') {
      if (!typedName.trim()) {
        toast('Please type your name for the signature');
        return;
      }
      sigData = `Typed: ${typedName.trim()}`;
    } else if (signType === 'upload') {
      if (!uploadedImage) {
        toast('Please upload or choose a signature image from your gallery');
        return;
      }
      sigData = uploadedImage;
    } else {
      if (!canvasRef.current) return;
      sigData = canvasRef.current.toDataURL('image/png');
    }

    setSubmitting(true);
    try {
      await signingService.submitSignature(token, {
        signature: sigData,
        signatureType: signType,
        consent: true,
        fieldValues,
      });
      const freshInfo = await signingService.getSigningInfo(token);
      setInfo(freshInfo);
      setCompleted(true);
      toast('Document signed and sealed successfully!');
    } catch (err) {
      toast(err.message || 'Failed to submit signature');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="signing-container">
        <div className="loading-center" style={{ minHeight: '60vh' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="signing-container">
        <header className="signing-header">
          <div className="brand" style={{ padding: 0 }}>
            <span className="brandmark">✦</span>
            <span>maac<span className="brandlight">sign</span></span>
          </div>
        </header>
        <div className="signing-body">
          <div className="card featureempty" style={{ margin: '60px auto' }}>
            <div className="illustration" style={{ background: '#ffebe9', color: '#d34b42' }}>✕</div>
            <h2>Unable to load document</h2>
            <p>{error}</p>
            <Link to="/login" className="btn primary" style={{ marginTop: '16px' }}>Go to MAAC Sign</Link>
          </div>
        </div>
      </div>
    );
  }

  // Sequential signing waiting state
  if (info?.status === 'waiting') {
    return (
      <div className="signing-container">
        <header className="signing-header">
          <div className="brand" style={{ padding: 0 }}>
            <span className="brandmark">✦</span>
            <span>maac<span className="brandlight">sign</span></span>
          </div>
          <div style={{ fontSize: '13px', color: '#c1d0cb' }}>
            Recipient #{info.order}: <strong>{info.recipient}</strong>
          </div>
        </header>
        <div className="signing-body">
          <div className="card featureempty" style={{ margin: '60px auto' }}>
            <div className="illustration" style={{ background: '#fdf4dc', color: '#b45309' }}>◷</div>
            <h2>Waiting for Previous Signer</h2>
            <p style={{ maxWidth: '520px', margin: '8px auto 16px', lineHeight: '1.6' }}>
              This agreement uses <strong>sequential signing order</strong>. It is currently awaiting signature from{' '}
              <strong>{info.waiting_for || 'the prior recipient'}</strong> before step #{info.order} can proceed.
            </p>
            <p className="smallmuted">
              You will receive an email as soon as it is your turn to review and sign.
            </p>
            <div className="btngroup" style={{ justifyContent: 'center', marginTop: '20px' }}>
              <a
                href={info.download}
                target="_blank"
                rel="noreferrer"
                className="btn"
              >
                Preview Document ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="signing-container">
      {/* Header */}
      <header className="signing-header">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brandmark">✦</span>
          <span>maac<span className="brandlight">sign</span></span>
        </div>
        <div style={{ fontSize: '13px', color: '#c1d0cb' }}>
          Signing as <strong>{info?.recipient}</strong> ({info?.email})
        </div>
      </header>

      {/* Body */}
      <div className="signing-body">
        {completed ? (
          <div className="card featureempty" style={{ margin: '40px auto' }}>
            <div className="illustration" style={{ background: '#e6f7ef', color: '#12855c' }}>✓</div>
            <h2>Document Completed</h2>
            <p>You have successfully signed <strong>{info?.document}</strong>. The finalized agreement has been sealed with a cryptographic SHA-256 integrity hash and verified audit trail.</p>
            <div className="btngroup" style={{ justifyContent: 'center', marginTop: '20px', gap: '12px' }}>
              <a
                href={info?.has_signed_file ? signingService.signFileSignedUrl(token) : signingService.signFileUrl(token)}
                target="_blank"
                rel="noreferrer"
                className="btn primary"
              >
                Download Signed PDF
              </a>
              {info?.has_certificate && (
                <a
                  href={signingService.signFileCertificateUrl(token)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn"
                >
                  Certificate of Completion
                </a>
              )}
              <Link to="/login" className="btn">Sign in to MAAC Sign</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="heading" style={{ marginBottom: '24px' }}>
              <div>
                <div className="eyebrow">SIGNATURE REQUEST</div>
                <h1 className="pagetitle">{info?.document || 'Document'}</h1>
                <p className="subtitle">{info?.subject || 'Please review and sign this document.'}</p>
                {info?.message && (
                  <div style={{ background: '#f5faf8', borderLeft: '3px solid var(--accent)', padding: '10px 14px', borderRadius: '4px', marginTop: '8px', fontSize: '13px', color: '#274b43' }}>
                    <strong>Message from sender:</strong> {info.message}
                  </div>
                )}
              </div>
              <div className="btngroup">
                <a
                  href={signingService.signFileUrl(token)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn"
                >
                  View / Download PDF ↗
                </a>
              </div>
            </div>

            {/* Document preview info box */}
            <div className="card" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                  <span className="smallmuted" style={{ display: 'block', marginBottom: '4px' }}>DOCUMENT NAME</span>
                  <strong>▤ &nbsp;{info?.document}</strong>
                </div>
                <div>
                  <span className="smallmuted" style={{ display: 'block', marginBottom: '4px' }}>RECIPIENT</span>
                  <span>{info?.recipient} ({info?.email})</span>
                </div>
                {info?.order && (
                  <div>
                    <span className="smallmuted" style={{ display: 'block', marginBottom: '4px' }}>ORDER</span>
                    <span>#{info.order}</span>
                  </div>
                )}
                <div>
                  <span className="smallmuted" style={{ display: 'block', marginBottom: '4px' }}>STATUS</span>
                  <span className="status inprogress">Ready to sign</span>
                </div>
              </div>
            </div>

            {/* Custom Assigned Fields (if any) */}
            {Array.isArray(info?.fields) && info.fields.filter((f) => f.type !== 'signature').length > 0 && (
              <div className="card" style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '17px' }}>Assigned Fields</h3>
                <p className="dialognote" style={{ marginBottom: '16px' }}>Please complete the following details requested for this agreement:</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                  {info.fields
                    .filter((f) => f.type !== 'signature')
                    .map((f) => {
                      if (f.type === 'checkbox' || f.type === 'checkbox_group') {
                        return (
                          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: '#fafcfb', borderRadius: '8px', border: '1px solid #edf2f0' }}>
                            <input
                              type="checkbox"
                              id={`field-${f.id}`}
                              checked={!!fieldValues[f.id]}
                              onChange={(e) => handleFieldChange(f.id, e.target.checked)}
                              style={{ width: '18px', height: '18px', accentColor: 'var(--green)' }}
                            />
                            <label htmlFor={`field-${f.id}`} style={{ fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>
                              {f.label || (f.type === 'checkbox_group' ? 'Checkbox group selection' : 'I agree / confirm')} {f.required && <span style={{ color: '#b33232' }}>*</span>}
                              <small style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', fontWeight: 400 }}>[Page {f.page}]</small>
                            </label>
                          </div>
                        );
                      }

                      if (f.type === 'radio') {
                        return (
                          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: '#fafcfb', borderRadius: '8px', border: '1px solid #edf2f0' }}>
                            <input
                              type="radio"
                              id={`field-${f.id}`}
                              checked={!!fieldValues[f.id]}
                              onChange={() => handleFieldChange(f.id, true)}
                              style={{ width: '18px', height: '18px', accentColor: 'var(--green)' }}
                            />
                            <label htmlFor={`field-${f.id}`} style={{ fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>
                              {f.label || 'Select option'} {f.required && <span style={{ color: '#b33232' }}>*</span>}
                              <small style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', fontWeight: 400 }}>[Page {f.page}]</small>
                            </label>
                          </div>
                        );
                      }

                      if (f.type === 'image' || f.type === 'stamp') {
                        return (
                          <div key={f.id} className="formfield" style={{ margin: 0 }}>
                            <label htmlFor={`field-${f.id}`}>
                              {f.label || (f.type === 'stamp' ? 'Stamp' : 'Image')}
                              {f.required && <span style={{ color: '#b33232' }}> *</span>}
                              <small style={{ color: 'var(--muted)', marginLeft: '6px' }}>[Page {f.page}]</small>
                            </label>
                            <input
                              id={`field-${f.id}`}
                              type="file"
                              accept="image/png,image/jpeg"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = () => handleFieldChange(f.id, reader.result);
                                  reader.readAsDataURL(file);
                                }
                              }}
                              style={{ fontSize: '12px', padding: '6px' }}
                            />
                            {fieldValues[f.id] && typeof fieldValues[f.id] === 'string' && fieldValues[f.id].startsWith('data:image') && (
                              <img src={fieldValues[f.id]} alt="Preview" style={{ height: '36px', marginTop: '6px', borderRadius: '4px', border: '1px solid #ccc' }} />
                            )}
                          </div>
                        );
                      }

                      if (f.type === 'dropdown') {
                        return (
                          <div key={f.id} className="formfield" style={{ margin: 0 }}>
                            <label htmlFor={`field-${f.id}`}>
                              {f.label || 'Dropdown selection'}
                              {f.required && <span style={{ color: '#b33232' }}> *</span>}
                              <small style={{ color: 'var(--muted)', marginLeft: '6px' }}>[Page {f.page}]</small>
                            </label>
                            <input
                              id={`field-${f.id}`}
                              list={`dropdown-options-${f.id}`}
                              value={fieldValues[f.id] || ''}
                              onChange={(e) => handleFieldChange(f.id, e.target.value)}
                              placeholder="Select or enter option"
                              required={f.required}
                            />
                            <datalist id={`dropdown-options-${f.id}`}>
                              <option value="Approved" />
                              <option value="Accepted" />
                              <option value="Verified" />
                              <option value="Confirmed" />
                              <option value="N/A" />
                            </datalist>
                          </div>
                        );
                      }

                      return (
                        <div key={f.id} className="formfield" style={{ margin: 0 }}>
                          <label htmlFor={`field-${f.id}`}>
                            {f.label || (f.type.charAt(0).toUpperCase() + f.type.slice(1).replace('_', ' '))}
                            {f.required && <span style={{ color: '#b33232' }}> *</span>}
                            <small style={{ color: 'var(--muted)', marginLeft: '6px' }}>[Page {f.page}]</small>
                          </label>
                          <input
                            id={`field-${f.id}`}
                            type={
                              f.type === 'email' ? 'email' :
                              f.type === 'date' ? 'date' : 'text'
                            }
                            value={fieldValues[f.id] || ''}
                            onChange={(e) => handleFieldChange(f.id, e.target.value)}
                            placeholder={`Enter ${f.label || f.type}`}
                            readOnly={f.type === 'date_signed' || f.type === 'sign_date'}
                            required={f.required && f.type !== 'date_signed' && f.type !== 'sign_date'}
                          />
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Signature form */}
            <div className="card">
              <h3 style={{ margin: '0 0 16px', fontSize: '17px' }}>Your Signature</h3>

              {/* Mode tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`chip ${signType === 'type' ? 'active' : ''}`}
                  onClick={() => setSignType('type')}
                >
                  Type signature
                </button>
                <button
                  type="button"
                  className={`chip ${signType === 'draw' ? 'active' : ''}`}
                  onClick={() => setSignType('draw')}
                >
                  Draw signature
                </button>
                <button
                  type="button"
                  className={`chip ${signType === 'upload' ? 'active' : ''}`}
                  onClick={() => setSignType('upload')}
                >
                  🖼 Upload signature image
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {signType === 'type' && (
                  <div>
                    <div className="formfield">
                      <label htmlFor="typed-name">Full Legal Name</label>
                      <input
                        id="typed-name"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        placeholder="Type your name"
                        required
                      />
                    </div>
                    {typedName && (
                      <div
                        style={{
                          background: '#f9fbfa',
                          border: '1px solid #dfe9e4',
                          borderRadius: '10px',
                          padding: '18px 24px',
                          fontFamily: 'cursive, "Brush Script MT", sans-serif',
                          fontSize: '28px',
                          color: '#123e35',
                          letterSpacing: '1px',
                          margin: '12px 0',
                        }}
                      >
                        {typedName}
                      </div>
                    )}
                  </div>
                )}

                {signType === 'draw' && (
                  <div>
                    <p className="dialognote">Draw your signature with your finger or mouse.</p>
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={180}
                      className="signature-pad"
                    />
                    <div style={{ marginTop: '8px' }}>
                      <button type="button" className="link" onClick={clearCanvas}>
                        Clear signature
                      </button>
                    </div>
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

                {/* Consent checkbox */}
                <div style={{ margin: '22px 0 18px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', cursor: 'pointer', lineHeight: '1.6' }}>
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      style={{ width: '18px', height: '18px', marginTop: '2px' }}
                      required
                    />
                    <span>
                      I agree that my electronic signature will have the same legal validity and enforceability as a handwritten signature under applicable electronic transaction laws (UETA & ESIGN).
                    </span>
                  </label>
                </div>

                <div className="btngroup">
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={submitting || !consent}
                    style={{ padding: '14px 28px', fontSize: '15px' }}
                  >
                    {submitting ? 'Submitting signature…' : 'Sign and Complete'}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SigningPage;
