import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import { documentService } from '../../services/documentService.js';
import { toast } from '../common/Toast.jsx';

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step, steps }) {
  return (
    <div className="wiz-steps">
      {steps.map((s, i) => (
        <div key={s} className={`wiz-step ${i + 1 === step ? 'active' : i + 1 < step ? 'done' : ''}`}>
          <div className="wiz-step-num">{i + 1 < step ? '✓' : i + 1}</div>
          <span>{s}</span>
          {i < steps.length - 1 && <div className="wiz-step-line" />}
        </div>
      ))}
    </div>
  );
}

// ─── STEP 1: Document Setup ───────────────────────────────────────────────────
function Step1Document({ docs, existingDocId, onDocReady, onClose }) {
  const [mode, setMode] = useState(existingDocId ? 'select' : 'upload');
  const [selectedDocId, setSelectedDocId] = useState(existingDocId || '');
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef();

  const handleFileSelect = (f) => {
    if (!f) return;
    if (f.size > 6 * 1024 * 1024) { setError('File exceeds 6 MB limit'); return; }
    if (!f.type.includes('pdf') && !f.name.endsWith('.pdf')) { setError('Only PDF files are accepted'); return; }
    setUploadFile(f);
    setError('');
    if (!uploadName) setUploadName(f.name.replace(/\.pdf$/i, ''));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleUpload = async () => {
    if (!uploadFile) { setError('Please choose a PDF file'); return; }
    if (!uploadName.trim()) { setError('Document name is required'); return; }
    setUploading(true);
    setError('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });
      const result = await documentService.upload({ name: uploadName.trim(), base64 });
      toast('Document uploaded');
      onDocReady(result.id, uploadName.trim());
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSelectExisting = () => {
    if (!selectedDocId) { setError('Please select a document'); return; }
    const doc = docs.find((d) => d.id === selectedDocId);
    onDocReady(selectedDocId, doc?.name || 'Document');
  };

  return (
    <div className="wiz-body">
      <h2 className="wiz-title">Prepare Document</h2>
      <p className="dialognote">Upload a new PDF or choose an existing draft from your workspace.</p>

      <div className="wiz-tabs">
        <button className={`wiz-tab${mode === 'upload' ? ' active' : ''}`} onClick={() => setMode('upload')}>
          ▤ Upload new PDF
        </button>
        <button className={`wiz-tab${mode === 'select' ? ' active' : ''}`} onClick={() => setMode('select')}>
          ◫ Use existing draft
        </button>
      </div>

      {mode === 'upload' && (
        <div>
          <div
            className={`filedrop${isDragging ? ' dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <div className="filedrop-icon">▤</div>
            {uploadFile ? (
              <>
                <strong>{uploadFile.name}</strong>
                <small>{(uploadFile.size / 1024).toFixed(0)} KB — PDF ready</small>
              </>
            ) : (
              <>
                <strong>Drag & drop PDF here</strong>
                <small>or click to browse — max 6 MB</small>
              </>
            )}
            <input ref={fileRef} type="file" accept="application/pdf" onChange={(e) => handleFileSelect(e.target.files[0])} style={{ display: 'none' }} />
          </div>

          <div className="formfield" style={{ marginTop: '16px' }}>
            <label htmlFor="doc-name">Document name</label>
            <input id="doc-name" value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="e.g. Service Agreement 2025" maxLength={150} />
          </div>
        </div>
      )}

      {mode === 'select' && (
        <div className="formfield" style={{ marginTop: '8px' }}>
          <label htmlFor="existing-doc">Select draft document</label>
          <select id="existing-doc" value={selectedDocId} onChange={(e) => { setSelectedDocId(e.target.value); setError(''); }}>
            <option value="">Choose a document…</option>
            {docs.filter((d) => d.status === 'draft').map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {docs.filter((d) => d.status === 'draft').length === 0 && (
            <small style={{ color: 'var(--muted)' }}>No draft documents found. Upload a PDF first.</small>
          )}
        </div>
      )}

      {error && <p style={{ color: '#b33232', fontSize: '12px', marginTop: '8px' }}>{error}</p>}

      <div className="btngroup" style={{ marginTop: '20px' }}>
        {mode === 'upload' ? (
          <button className="btn primary" onClick={handleUpload} disabled={uploading || !uploadFile}>
            {uploading ? 'Uploading…' : 'Continue →'}
          </button>
        ) : (
          <button className="btn primary" onClick={handleSelectExisting} disabled={!selectedDocId}>
            Continue →
          </button>
        )}
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ─── STEP 2: Recipients ───────────────────────────────────────────────────────
const RECIPIENT_COLORS = ['#14866c', '#2563eb', '#7c3aed', '#d97706', '#0891b2', '#e11d48'];

function Step2Recipients({ recipients, setRecipients, sequential, setSequential, subject, setSubject, message, setMessage, onNext, onBack }) {
  const { user: currentUser } = useAuth();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showEmailSettings, setShowEmailSettings] = useState(Boolean(message));

  const addRecipient = () => {
    setRecipients([
      ...recipients,
      { id: Date.now(), email: '', name: '', role: 'signer', order: recipients.length + 1 }
    ]);
  };

  const addMyself = () => {
    if (!currentUser?.email) return;
    const emailNorm = currentUser.email.trim().toLowerCase();
    const alreadyExists = recipients.some(r => r.email.trim().toLowerCase() === emailNorm);
    if (alreadyExists) {
      setError('You are already included in the recipient list');
      return;
    }
    const myName = currentUser.name || currentUser.email.split('@')[0];
    // If the first recipient is empty, replace it; otherwise append
    if (recipients.length === 1 && !recipients[0].name.trim() && !recipients[0].email.trim()) {
      setRecipients([{ ...recipients[0], name: myName, email: currentUser.email }]);
    } else {
      setRecipients([
        ...recipients,
        { id: Date.now(), email: currentUser.email, name: myName, role: 'signer', order: recipients.length + 1 }
      ]);
    }
    setError('');
  };

  const removeRecipient = (idx) => {
    setRecipients(recipients.filter((_, i) => i !== idx).map((r, i) => ({ ...r, order: i + 1 })));
  };

  const updateRecipient = (idx, field, value) => {
    setRecipients(recipients.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    if (error) setError('');
  };

  const moveRecipient = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= recipients.length) return;
    const list = [...recipients];
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    setRecipients(list.map((r, i) => ({ ...r, order: i + 1 })));
  };

  const isSelfAdded = currentUser?.email && recipients.some(
    r => r.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase()
  );

  const validate = () => {
    if (!subject.trim()) { setError('Subject line is required'); return false; }
    if (recipients.length === 0) { setError('Add at least one recipient'); return false; }
    const emails = [];
    for (const r of recipients) {
      if (!r.email.trim()) { setError('All recipient email addresses are required'); return false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) { setError(`Invalid email: ${r.email}`); return false; }
      if (!r.name.trim()) { setError('All recipient names are required'); return false; }
      if (emails.includes(r.email.trim().toLowerCase())) { setError(`Duplicate email: ${r.email}`); return false; }
      emails.push(r.email.trim().toLowerCase());
    }
    return true;
  };

  const handleNext = async () => {
    if (!validate()) return;
    setError('');
    setSaving(true);
    try {
      await onNext();
    } catch (err) {
      setError(err.message || 'Failed to save recipients and proceed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wiz-body">
      <h2 className="wiz-title">Add Recipients</h2>
      <p className="dialognote">Add who needs to sign or review this document and configure the signing order.</p>

      {/* Subject Line */}
      <div className="formfield" style={{ marginBottom: '20px' }}>
        <label htmlFor="req-subject">Document Subject <span style={{ color: '#d34b42' }}>*</span></label>
        <input
          id="req-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Please sign: Service Agreement 2025"
          maxLength={200}
        />
      </div>

      {/* Header bar with counter & iOS-style sequential toggle */}
      <div className="wiz-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>Recipients</span>
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            background: 'var(--accent)',
            color: 'var(--green)',
            padding: '2px 8px',
            borderRadius: '12px'
          }}>
            {recipients.length}
          </span>
        </div>

        <div
          className="wiz-switch-wrap"
          onClick={() => setSequential(!sequential)}
          role="switch"
          aria-checked={sequential}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSequential(!sequential); } }}
        >
          <div className={`wiz-switch ${sequential ? 'active' : ''}`}>
            <div className="wiz-switch-thumb" />
          </div>
          <span>Sequential signing</span>
        </div>
      </div>

      {/* Sequential signing visual workflow pills */}
      {sequential && (
        <div className="wiz-flow-diagram">
          <div className="wiz-flow-header">
            <span>⏱</span>
            <span>Signing Sequence Workflow</span>
          </div>
          <div className="wiz-flow-steps">
            {recipients.map((r, i) => (
              <div key={r.id || i} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span className="wiz-flow-step-pill">
                  <span style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length],
                    color: 'white',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 700
                  }}>
                    {i + 1}
                  </span>
                  {r.name.trim() || `Signer ${i + 1}`}
                  <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 400 }}>
                    ({r.role === 'signer' ? 'Signs' : 'Views'})
                  </span>
                </span>
                <span className="wiz-flow-arrow">➔</span>
              </div>
            ))}
            <span className="wiz-flow-step-pill" style={{ background: '#eef8f4', borderColor: '#b8dfd1', color: 'var(--green)' }}>
              ✓ Complete
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '11.5px', color: 'var(--muted)' }}>
            Each recipient will only receive the document after the previous signer has completed.
          </p>
        </div>
      )}

      {/* Recipient Cards */}
      <div className="wiz-recipients-list">
        {recipients.map((r, i) => {
          const color = RECIPIENT_COLORS[i % RECIPIENT_COLORS.length];
          return (
            <div key={r.id || i} className="wiz-recipient-card">
              <div className="wiz-recipient-card-top">
                <div className="wiz-recipient-badge-group">
                  <div className="wiz-recipient-order-badge" style={{ background: color }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>
                    Recipient #{i + 1}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: r.role === 'signer' ? '#eef8f4' : '#f0f4f8',
                    color: r.role === 'signer' ? 'var(--green)' : '#475569',
                    fontWeight: 600
                  }}>
                    {r.role === 'signer' ? 'Signer' : 'Viewer'}
                  </span>
                </div>

                <div className="wiz-card-actions">
                  <button
                    type="button"
                    className="wiz-icon-btn"
                    onClick={() => moveRecipient(i, i - 1)}
                    disabled={i === 0}
                    title="Move up"
                    aria-label="Move recipient up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="wiz-icon-btn"
                    onClick={() => moveRecipient(i, i + 1)}
                    disabled={i === recipients.length - 1}
                    title="Move down"
                    aria-label="Move recipient down"
                  >
                    ▼
                  </button>
                  {recipients.length > 1 && (
                    <button
                      type="button"
                      className="wiz-icon-btn danger"
                      onClick={() => removeRecipient(i)}
                      title="Remove recipient"
                      aria-label="Remove recipient"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div className="wiz-recipient-inputs">
                <div className="wiz-input-wrapper">
                  <span className="wiz-input-icon">👤</span>
                  <input
                    placeholder="Full name"
                    value={r.name}
                    onChange={(e) => updateRecipient(i, 'name', e.target.value)}
                  />
                </div>

                <div className="wiz-input-wrapper">
                  <span className="wiz-input-icon">✉</span>
                  <input
                    type="email"
                    placeholder="email@company.com"
                    value={r.email}
                    onChange={(e) => updateRecipient(i, 'email', e.target.value)}
                  />
                </div>

                <select
                  className="wiz-recipient-role-select"
                  value={r.role}
                  onChange={(e) => updateRecipient(i, 'role', e.target.value)}
                >
                  <option value="signer">✒ Needs to Sign</option>
                  <option value="viewer">👁 Receives a Copy</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Action Buttons */}
      <div className="wiz-quick-btns">
        <button type="button" className="wiz-add-card-btn" onClick={addRecipient}>
          <span>＋</span> Add another recipient
        </button>

        {currentUser?.email && !isSelfAdded && (
          <button type="button" className="wiz-add-self-btn" onClick={addMyself} title={`Add ${currentUser.email}`}>
            <span>👤</span> Add myself as recipient
          </button>
        )}
      </div>

      {/* Collapsible Personal Message Settings */}
      <div className="wiz-accordion">
        <button
          type="button"
          className="wiz-accordion-toggle"
          onClick={() => setShowEmailSettings(!showEmailSettings)}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✉</span> Email Message to Recipients
            {message && (
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--green)', background: '#eef8f4', padding: '1px 6px', borderRadius: '8px' }}>
                Custom message added
              </span>
            )}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
            {showEmailSettings ? '▲ Hide' : '▼ Add message'}
          </span>
        </button>

        {showEmailSettings && (
          <div className="wiz-accordion-content">
            <label htmlFor="req-message" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>
              Personal Note <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(included in signing invitation email)</span>
            </label>
            <textarea
              id="req-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Please review and sign this agreement by the end of the week. Let me know if you have any questions!"
              rows={3}
              style={{ width: '100%', resize: 'vertical', borderRadius: '8px', border: '1px solid #dfe9e4', padding: '10px 12px', fontSize: '13px' }}
            />
          </div>
        )}
      </div>

      {error && (
        <div style={{
          marginTop: '16px',
          padding: '10px 14px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#b91c1c',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⚠</span> {error}
        </div>
      )}

      <div className="btngroup" style={{ marginTop: '24px' }}>
        <button className="btn primary" onClick={handleNext} disabled={saving}>
          {saving ? 'Saving recipients…' : 'Continue to Fields →'}
        </button>
        <button className="btn" onClick={onBack} disabled={saving}>← Back</button>
      </div>
    </div>
  );
}

// ─── FIELD TOOLBAR & ICONS ───────────────────────────────────────────────────
const DragDots = () => (
  <svg viewBox="0 0 8 14" width="6" height="12" fill="currentColor">
    <circle cx="2" cy="2" r="1.3" />
    <circle cx="2" cy="7" r="1.3" />
    <circle cx="2" cy="12" r="1.3" />
    <circle cx="6" cy="2" r="1.3" />
    <circle cx="6" cy="7" r="1.3" />
    <circle cx="6" cy="12" r="1.3" />
  </svg>
);

const FIELD_ICONS = {
  signature: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      <path d="m15 5 4 4" />
    </svg>
  ),
  initials: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18c3-3 6-3 8-1s4 4 7 2c2-1 3-3 3-5" />
      <path d="M8 12c1.5-3 3.5-5 5-5s2 2 1.5 5" />
    </svg>
  ),
  stamp: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a2 2 0 0 0-2 2v3H8a2 2 0 0 0-2 2v2h12v-2a2 2 0 0 0-2-2h-2V5a2 2 0 0 0-2-2z" />
      <rect x="4" y="16" width="16" height="4" rx="1" />
      <path d="M7 20h10" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  company: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" />
      <line x1="8" y1="6" x2="10" y2="6" />
      <line x1="14" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="10" y2="10" />
      <line x1="14" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="10" y2="14" />
      <line x1="14" y1="14" x2="16" y2="14" />
    </svg>
  ),
  name: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  email: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  ),
  date_signed: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  ),
  date: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <circle cx="8" cy="14" r="1" fill="currentColor" />
      <circle cx="12" cy="14" r="1" fill="currentColor" />
      <circle cx="16" cy="14" r="1" fill="currentColor" />
      <circle cx="8" cy="18" r="1" fill="currentColor" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  text: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 17l4-9 4 9" />
      <line x1="9.5" y1="13.5" x2="14.5" y2="13.5" />
    </svg>
  ),
  title: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="2" x2="15" y2="2" />
      <path d="M9 16l3-6 3 6" />
      <line x1="10" y1="13" x2="14" y2="13" />
    </svg>
  ),
  checkbox: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <polyline points="9 12 11.5 14.5 16 9" />
    </svg>
  ),
  dropdown: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <polyline points="8 10 12 14 16 10" />
    </svg>
  ),
  radio: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </svg>
  ),
  checkbox_group: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="13" height="13" rx="2" />
      <polyline points="7 9 9 11 12 7" />
      <path d="M7 17h9a2 2 0 0 0 2-2V7" />
    </svg>
  ),
};

const FIELD_TYPES = [
  // Row 1
  { type: 'signature', label: 'Signature', displayLabel: 'Signature', iconKey: 'signature', color: '#14866c', w: 0.28, h: 0.06 },
  { type: 'initials', label: 'Initial', displayLabel: 'Initial', iconKey: 'initials', color: '#2563eb', w: 0.16, h: 0.05 },
  // Row 2
  { type: 'stamp', label: 'Stamp', displayLabel: 'Stamp', iconKey: 'stamp', color: '#059669', w: 0.18, h: 0.08 },
  { type: 'image', label: 'Image', displayLabel: 'Image', iconKey: 'image', color: '#0891b2', w: 0.22, h: 0.10 },
  // Row 3
  { type: 'company', label: 'Company', displayLabel: 'Company', iconKey: 'company', color: '#4f46e5', w: 0.22, h: 0.045 },
  { type: 'name', label: 'Full name', displayLabel: 'Full name', iconKey: 'name', color: '#0d9488', w: 0.22, h: 0.045 },
  // Row 4
  { type: 'email', label: 'Email', displayLabel: 'Email', iconKey: 'email', color: '#16a34a', w: 0.24, h: 0.045 },
  { type: 'date_signed', label: 'Sign date', displayLabel: 'Sign date', iconKey: 'date_signed', color: '#7c3aed', w: 0.18, h: 0.045 },
  // Row 5
  { type: 'date', label: 'Date', displayLabel: 'Date', iconKey: 'date', color: '#9333ea', w: 0.18, h: 0.045 },
  { type: 'text', label: 'Text', displayLabel: 'Text', iconKey: 'text', color: '#d97706', w: 0.22, h: 0.045 },
  // Row 6
  { type: 'title', label: 'Job title', displayLabel: 'Job title', iconKey: 'title', color: '#ea580c', w: 0.22, h: 0.045 },
  { type: 'checkbox', label: 'Checkbox', displayLabel: 'Checkbox', iconKey: 'checkbox', color: '#dc2626', w: 0.05, h: 0.04 },
  // Row 7
  { type: 'dropdown', label: 'Dropdown', displayLabel: 'Dropdown', iconKey: 'dropdown', color: '#2563eb', w: 0.22, h: 0.045 },
  { type: 'radio', label: 'Radio', displayLabel: 'Radio', iconKey: 'radio', color: '#e11d48', w: 0.05, h: 0.04 },
  // Row 8
  { type: 'checkbox_group', label: 'Checkbox group', displayLabel: 'Checkbox gr...', iconKey: 'checkbox_group', color: '#059669', w: 0.24, h: 0.08 },
];

// ─── STEP 3: PDF Field Editor ─────────────────────────────────────────────────
function Step3FieldEditor({ documentId, requestId, recipients, fields, setFields, onNext, onBack }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [pdfPages, setPdfPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [pageDimensions, setPageDimensions] = useState({ width: 612, height: 792 });
  const [selectedField, setSelectedField] = useState(null);
  const [dragInfo, setDragInfo] = useState(null);
  const [resizeInfo, setResizeInfo] = useState(null);
  const [activeRecipient, setActiveRecipient] = useState(recipients[0]?.id || null);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const pdfjsRef = useRef(null);
  const pdfDocRef = useRef(null);
  const renderTaskRef = useRef(null);

  // Load PDF.js and the document
  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      try {
        // Load PDF.js from CDN
        if (!window.pdfjsLib) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        if (cancelled) return;

        const docUrl = `/api/documents/${documentId}/download`;
        const pdfDoc = await window.pdfjsLib.getDocument({ url: docUrl, withCredentials: true }).promise;
        if (cancelled) return;

        pdfDocRef.current = pdfDoc;
        setPdfPages(pdfDoc.numPages);
        setPdfLoaded(true);
      } catch (err) {
        if (!cancelled) setPdfError('Could not load PDF preview. You can still add fields by position.');
      }
    };

    loadPdf();
    return () => { cancelled = true; };
  }, [documentId]);

  // Render current page
  useEffect(() => {
    if (!pdfLoaded || !pdfDocRef.current || !canvasRef.current) return;

    const renderPage = async () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
      try {
        const page = await pdfDocRef.current.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1 });
        const containerWidth = containerRef.current?.clientWidth || 700;
        const fitScale = (containerWidth - 40) / viewport.width;
        const displayScale = Math.min(fitScale, 1.5);

        const scaledViewport = page.getViewport({ scale: displayScale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        setScale(displayScale);
        setPageDimensions({ width: viewport.width, height: viewport.height });

        const task = page.render({ canvasContext: ctx, viewport: scaledViewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch {}
    };

    renderPage();
  }, [pdfLoaded, currentPage]);

  const pageFields = fields.filter((f) => f.page === currentPage);

  const addField = (type, customPos = null) => {
    const def = FIELD_TYPES.find((t) => t.type === type) || FIELD_TYPES[0];
    const offsetIndex = fields.filter((f) => f.page === currentPage).length;
    const defaultX = 0.12 + (offsetIndex % 3) * 0.26;
    const defaultY = 0.2 + (offsetIndex % 6) * 0.08;

    const newField = {
      id: `f_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type,
      page: currentPage,
      x: customPos ? customPos.x : Math.min(1 - def.w, defaultX),
      y: customPos ? customPos.y : Math.min(1 - def.h, defaultY),
      width: def.w,
      height: def.h,
      required: true,
      label: def.label,
      recipient_id: activeRecipient,
    };
    setFields([...fields, newField]);
    setSelectedField(newField.id);
  };

  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('text/plain', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleCanvasDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    if (!type) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dropX = (e.clientX - rect.left) / rect.width;
    const dropY = (e.clientY - rect.top) / rect.height;
    const def = FIELD_TYPES.find((t) => t.type === type) || FIELD_TYPES[0];
    const clampedX = Math.max(0, Math.min(1 - def.w, dropX - def.w / 2));
    const clampedY = Math.max(0, Math.min(1 - def.h, dropY - def.h / 2));
    addField(type, { x: clampedX, y: clampedY });
  };

  const deleteField = (id) => {
    setFields(fields.filter((f) => f.id !== id));
    if (selectedField === id) setSelectedField(null);
  };

  const updateField = (id, updates) => {
    setFields(fields.map((f) => f.id === id ? { ...f, ...updates } : f));
  };

  // Mouse drag to reposition field
  const handleFieldMouseDown = (e, fieldId) => {
    e.stopPropagation();
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;

    setSelectedField(fieldId);

    const startX = e.clientX;
    const startY = e.clientY;
    const startFieldX = field.x;
    const startFieldY = field.y;

    const onMove = (me) => {
      const dx = (me.clientX - startX) / cw;
      const dy = (me.clientY - startY) / ch;
      const newX = Math.max(0, Math.min(1 - field.width, startFieldX + dx));
      const newY = Math.max(0, Math.min(1 - field.height, startFieldY + dy));
      updateField(fieldId, { x: newX, y: newY });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Resize handle
  const handleResizeMouseDown = (e, fieldId) => {
    e.stopPropagation();
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = field.width;
    const startH = field.height;

    const onMove = (me) => {
      const dw = (me.clientX - startX) / cw;
      const dh = (me.clientY - startY) / ch;
      const newW = Math.max(0.04, Math.min(1 - field.x, startW + dw));
      const newH = Math.max(0.03, Math.min(1 - field.y, startH + dh));
      updateField(fieldId, { width: newW, height: newH });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const canvasWidth = canvasRef.current ? canvasRef.current.width : 612;
  const canvasHeight = canvasRef.current ? canvasRef.current.height : 792;

  return (
    <div className="wiz-body wiz-editor">
      <div className="wiz-editor-sidebar">
        <h3 className="wiz-standard-fields-header">Standard fields</h3>
        <hr className="wiz-standard-fields-divider" />

        {recipients.length > 0 && (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
              Assign fields to
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {recipients.map((r, i) => {
                const color = RECIPIENT_COLORS[i % RECIPIENT_COLORS.length];
                const isActive = activeRecipient === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveRecipient(r.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: isActive ? color : 'var(--border)',
                      background: isActive ? `${color}15` : 'transparent',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: isActive ? 700 : 500,
                    }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name || r.email || `Signer ${i + 1}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="wiz-field-palette">
          {FIELD_TYPES.map((ft) => (
            <button
              key={ft.type}
              type="button"
              className="wiz-field-btn"
              onClick={() => addField(ft.type)}
              draggable
              onDragStart={(e) => handleDragStart(e, ft.type)}
              title={`Click or drag to place ${ft.label}`}
            >
              <div className="wiz-field-btn-left">
                <span className="wiz-field-drag-dots"><DragDots /></span>
                <span className="wiz-field-btn-label">{ft.displayLabel || ft.label}</span>
              </div>
              <div className="wiz-field-btn-badge">
                {FIELD_ICONS[ft.iconKey || ft.type] || FIELD_ICONS.text}
              </div>
            </button>
          ))}
        </div>

        {selectedField && (() => {
          const f = fields.find((x) => x.id === selectedField);
          if (!f) return null;
          return (
            <div className="wiz-field-inspector">
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Selected Field
              </div>
              <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                <strong>{f.label || f.type}</strong> on page {f.page}
              </div>

              <div className="formfield" style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px' }}>Field Label</label>
                <input
                  type="text"
                  value={f.label || ''}
                  onChange={(e) => updateField(f.id, { label: e.target.value })}
                  style={{ fontSize: '12px', padding: '6px 8px' }}
                />
              </div>

              {recipients.length > 1 && (
                <div className="formfield" style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '11px' }}>Assigned To</label>
                  <select
                    value={f.recipient_id || ''}
                    onChange={(e) => updateField(f.id, { recipient_id: e.target.value })}
                    style={{ fontSize: '12px', padding: '6px 8px' }}
                  >
                    {recipients.map((r, i) => (
                      <option key={r.id} value={r.id}>
                        #{i + 1} {r.name || r.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '8px' }}>
                <input type="checkbox" checked={f.required} onChange={(e) => updateField(f.id, { required: e.target.checked })} />
                Required field
              </label>

              <button
                className="btn"
                style={{ fontSize: '11px', padding: '4px 10px', color: '#b33232', borderColor: '#b33232', width: '100%' }}
                onClick={() => deleteField(f.id)}
              >
                Delete field
              </button>
            </div>
          );
        })()}

        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--muted)' }}>
          {fields.length} field{fields.length !== 1 ? 's' : ''} placed
        </div>
      </div>

      <div className="wiz-editor-main" ref={containerRef}>
        <div className="wiz-pdf-toolbar">
          <button className="btn" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>← Prev</button>
          <span style={{ fontSize: '13px' }}>Page {currentPage} of {pdfPages}</span>
          <button className="btn" onClick={() => setCurrentPage((p) => Math.min(pdfPages, p + 1))} disabled={currentPage >= pdfPages}>Next →</button>
        </div>

        <div
          className="wiz-pdf-canvas-wrap"
          onClick={() => setSelectedField(null)}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
        >
          {!pdfLoaded && !pdfError && <div className="loading-center" style={{ minHeight: '300px' }}><div className="spinner" /></div>}
          {pdfError && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>▤</div>
              <p>{pdfError}</p>
              <p>You can still add fields — they will be placed at the specified positions.</p>
            </div>
          )}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <canvas ref={canvasRef} style={{ display: pdfLoaded ? 'block' : 'none', maxWidth: '100%' }} />
            {/* Field overlays */}
            {pageFields.map((f) => {
              const isSel = selectedField === f.id;
              const def = FIELD_TYPES.find((t) => t.type === f.type) || FIELD_TYPES[0];
              const recipient = recipients.find((r) => r.id === f.recipient_id);
              const recipientIdx = recipients.findIndex((r) => r.id === f.recipient_id);
              const color = recipientIdx >= 0 ? RECIPIENT_COLORS[recipientIdx % RECIPIENT_COLORS.length] : def.color;

              return (
                <div
                  key={f.id}
                  onMouseDown={(e) => handleFieldMouseDown(e, f.id)}
                  onClick={(e) => { e.stopPropagation(); setSelectedField(f.id); }}
                  style={{
                    position: 'absolute',
                    left: `${f.x * 100}%`,
                    top: `${f.y * 100}%`,
                    width: `${f.width * 100}%`,
                    height: `${f.height * 100}%`,
                    border: `2px solid ${isSel ? color : color + 'aa'}`,
                    background: `${color}18`,
                    borderRadius: '4px',
                    cursor: 'grab',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px 6px',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    zIndex: isSel ? 100 : 10,
                    boxShadow: isSel ? `0 0 0 2px white, 0 0 0 4px ${color}` : '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ display: 'inline-flex', color, flexShrink: 0 }}>
                      {FIELD_ICONS[def.iconKey || f.type] || FIELD_ICONS.text}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#162a22', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.label}{recipient?.name ? ` (${recipient.name})` : ''}
                    </span>
                  </div>
                  {isSel && (
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, f.id)}
                      style={{
                        position: 'absolute',
                        right: 0,
                        bottom: 0,
                        width: '12px',
                        height: '12px',
                        cursor: 'nwse-resize',
                        background: color,
                        borderRadius: '2px 0 2px 0',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="wiz-editor-nav">
        <div className="btngroup">
          <button className="btn primary" onClick={onNext}>Continue →</button>
          <button className="btn" onClick={onBack}>← Back</button>
        </div>
        {fields.length === 0 && (
          <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '8px 0 0' }}>
            No fields placed — recipients will sign with a general signature.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── STEP 4: Review & Send ────────────────────────────────────────────────────
function Step4Review({ docName, recipients, sequential, subject, message, fields, onSend, onBack, sending, sendError }) {
  const fieldsByRecipient = {};
  for (const r of recipients) fieldsByRecipient[r.id] = fields.filter((f) => f.recipient_id === r.id || !f.recipient_id);

  return (
    <div className="wiz-body">
      <h2 className="wiz-title">Review & Send</h2>

      <div className="card" style={{ marginBottom: '16px', padding: '16px 20px' }}>
        <div className="smallmuted" style={{ marginBottom: '4px' }}>DOCUMENT</div>
        <strong>▤ {docName}</strong>
      </div>

      <div className="card" style={{ marginBottom: '16px', padding: '16px 20px' }}>
        <div className="smallmuted" style={{ marginBottom: '8px' }}>SIGNING SETTINGS</div>
        <div><strong>Subject:</strong> {subject}</div>
        {message && <div style={{ marginTop: '4px', color: 'var(--muted)', fontSize: '13px' }}>{message}</div>}
        <div style={{ marginTop: '8px', fontSize: '13px' }}>
          <span className={`status ${sequential ? 'inprogress' : 'completed'}`}>
            {sequential ? 'Sequential signing' : 'Parallel signing'}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '16px', padding: '16px 20px' }}>
        <div className="smallmuted" style={{ marginBottom: '8px' }}>RECIPIENTS ({recipients.length})</div>
        {recipients.map((r, i) => (
          <div key={r.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < recipients.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{i + 1}. {r.name}</div>
              <div style={{ color: 'var(--muted)', fontSize: '12px' }}>{r.email}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="status pending">{r.role === 'viewer' ? 'Viewer' : 'Needs to sign'}</span>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {(fieldsByRecipient[r.id] || []).length} field{(fieldsByRecipient[r.id] || []).length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        ))}
      </div>

      {sendError && <p style={{ color: '#b33232', fontSize: '13px', margin: '0 0 12px' }}>{sendError}</p>}

      <div className="btngroup">
        <button className="btn primary" onClick={onSend} disabled={sending}>
          {sending ? 'Sending invitations…' : '✉ Send for signatures'}
        </button>
        <button className="btn" onClick={onBack} disabled={sending}>← Back</button>
      </div>
    </div>
  );
}

// ─── SUCCESS STATE ────────────────────────────────────────────────────────────
function SendSuccess({ results, onClose }) {
  const allSent = results.every((r) => r.emailSent);
  const copyLink = async (url) => {
    try { await navigator.clipboard.writeText(url); toast('Link copied!'); } catch { toast('Copy failed'); }
  };

  return (
    <div className="wiz-body">
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
        <h2 style={{ margin: '0 0 8px', color: 'var(--accent)' }}>Request Sent!</h2>
        <p style={{ color: 'var(--muted)', margin: 0 }}>
          {allSent ? 'Invitations were delivered to all recipients.' : 'Request created. Some emails may need manual sharing.'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
        {results.map((r, i) => (
          <div key={i} className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>{r.email}</div>
              <div style={{ fontSize: '12px', color: r.emailSent ? '#14866c' : '#b33232' }}>
                {r.emailSent ? '✓ Invitation email sent' : `⚠ Email failed — share link manually`}
              </div>
            </div>
            {!r.emailSent && r.invitation && (
              <button className="btn" style={{ fontSize: '11px', whiteSpace: 'nowrap' }} onClick={() => copyLink(r.invitation)}>
                Copy link
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="btngroup" style={{ justifyContent: 'center' }}>
        <button className="btn primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

// ─── MAIN WIZARD COMPONENT ────────────────────────────────────────────────────
export function SendWorkflow({ docs: initialDocs, onClose, onSuccess, initialDocId }) {
  const [step, setStep] = useState(1);
  const [docs, setDocs] = useState(initialDocs || []);
  const [docId, setDocId] = useState(initialDocId || '');
  const [docName, setDocName] = useState('');
  const [requestId, setRequestId] = useState(null);
  const [recipients, setRecipients] = useState([{ id: Date.now(), email: '', name: '', role: 'signer', order: 1 }]);
  const [sequential, setSequential] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [fields, setFields] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendResults, setSendResults] = useState(null);

  // Refresh docs list
  useEffect(() => {
    documentService.list().then(setDocs).catch(() => {});
  }, []);

  const STEPS = ['Document', 'Recipients', 'Fields', 'Send'];

  const handleDocReady = async (id, name) => {
    setDocId(id);
    setDocName(name);
    // Auto-populate subject
    if (!subject) setSubject(`Please sign: ${name}`);
    setStep(2);
  };

  const handleRecipientsNext = async () => {
    // Create or update the draft request
    try {
      if (!docId) {
        throw new Error('Please select or upload a document first (Step 1)');
      }

      let reqId = requestId;
      if (!reqId) {
        const result = await api.post('/requests/draft', {
          documentId: docId,
          subject,
          message,
          sequentialSigning: sequential,
        });
        reqId = result.id;
        setRequestId(reqId);
      } else {
        await api.patch(`/requests/${reqId}/draft`, { subject, message, sequentialSigning: sequential });
      }

      // Save recipients
      const recipientData = recipients.map((r, i) => ({
        email: r.email.trim().toLowerCase(),
        name: r.name.trim(),
        role: r.role || 'signer',
        order: i + 1,
      }));
      const savedRecipients = await api.put(`/requests/${reqId}/recipients`, { recipients: recipientData });

      // Map back with IDs from server
      const updatedRecipients = recipients.map((r, i) => ({
        ...r,
        serverId: savedRecipients[i]?.id || r.id,
        id: savedRecipients[i]?.id || r.id,
      }));
      setRecipients(updatedRecipients);
      setStep(3);
    } catch (err) {
      toast(err.message || 'Failed to save recipients');
      throw err;
    }
  };

  const handleFieldsNext = async () => {
    if (requestId && fields.length > 0) {
      try {
        await api.put(`/requests/${requestId}/fields`, {
          fields: fields.map((f) => ({
            type: f.type,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            required: f.required,
            label: f.label,
            recipient_id: f.recipient_id || null,
          })),
        });
      } catch (err) {
        console.warn('Failed to save fields:', err.message);
        // Don't block — user can still send
      }
    }
    setStep(4);
  };

  const handleSend = async () => {
    setSending(true);
    setSendError('');
    try {
      const result = await api.post(`/requests/${requestId}/send`);
      setSendResults(result.results || []);
      onSuccess?.();
    } catch (err) {
      setSendError(err.message || 'Failed to send signing request');
    } finally {
      setSending(false);
    }
  };

  if (sendResults) {
    return (
      <div className="wiz-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className={`wiz-panel${step === 3 ? ' wiz-panel-wide' : ''}`}>
          <button className="wiz-close" onClick={onClose}>✕</button>
          <SendSuccess results={sendResults} onClose={onClose} />
        </div>
      </div>
    );
  }

  return (
    <div className="wiz-overlay" onClick={(e) => e.target === e.currentTarget && step !== 3 && onClose()}>
      <div className={`wiz-panel${step === 3 ? ' wiz-panel-wide' : ''}`}>
        <button className="wiz-close" onClick={onClose}>✕</button>
        <StepIndicator step={step} steps={STEPS} />

        {step === 1 && (
          <Step1Document
            docs={docs}
            existingDocId={initialDocId}
            onDocReady={handleDocReady}
            onClose={onClose}
          />
        )}
        {step === 2 && (
          <Step2Recipients
            recipients={recipients}
            setRecipients={setRecipients}
            sequential={sequential}
            setSequential={setSequential}
            subject={subject}
            setSubject={setSubject}
            message={message}
            setMessage={setMessage}
            onNext={handleRecipientsNext}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <Step3FieldEditor
            documentId={docId}
            requestId={requestId}
            recipients={recipients}
            fields={fields}
            setFields={setFields}
            onNext={handleFieldsNext}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <Step4Review
            docName={docName}
            recipients={recipients}
            sequential={sequential}
            subject={subject}
            message={message}
            fields={fields}
            onSend={handleSend}
            onBack={() => setStep(3)}
            sending={sending}
            sendError={sendError}
          />
        )}
      </div>
    </div>
  );
}

export default SendWorkflow;
