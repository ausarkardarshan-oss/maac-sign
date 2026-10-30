import { useState, useEffect } from 'react';
import { documentService } from '../../services/documentService.js';
import { toast } from '../common/Toast.jsx';

function StatusBadge({ status }) {
  const cls = status?.replace(/_/g, '').replace(/\s+/g, '').toLowerCase();
  return <span className={`status ${cls}`}>{status?.replace(/_/g, ' ')}</span>;
}

export function DocumentDetailModal({ docId, onClose, onRefresh }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Email modal state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailName, setEmailName] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailError, setEmailError] = useState('');

  const loadDetails = async () => {
    setLoading(true);
    try {
      const data = await documentService.get(docId);
      setDoc(data);
    } catch (err) {
      setError(err.message || 'Failed to load document details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (docId) loadDetails();
  }, [docId]);

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!emailTo.trim()) {
      setEmailError('Recipient email is required');
      return;
    }
    setSendingEmail(true);
    setEmailError('');
    setEmailSuccess('');
    try {
      const result = await documentService.email(docId, {
        email: emailTo.trim(),
        name: emailName.trim() || emailTo.trim(),
      });
      setEmailSuccess(`Document successfully dispatched to ${result.to || emailTo}`);
      toast('Document sent via email');
      loadDetails();
      onRefresh?.();
    } catch (err) {
      setEmailError(err.message || 'Failed to deliver email');
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="wiz-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="wiz-panel" style={{ maxWidth: '680px', padding: '40px', textAlign: 'center' }}>
          <div className="loading-center"><div className="spinner" /></div>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="wiz-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="wiz-panel" style={{ maxWidth: '520px', padding: '30px' }}>
          <button className="wiz-close" onClick={onClose}>✕</button>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '32px', color: '#b33232', marginBottom: '8px' }}>✕</div>
            <h3>Unable to load document</h3>
            <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{error || 'Document not found'}</p>
            <button className="btn primary" onClick={onClose} style={{ marginTop: '16px' }}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const isCompleted = doc.status === 'completed';
  const recipients = doc.recipients || [];

  return (
    <div className="wiz-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wiz-panel" style={{ maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="wiz-close" onClick={onClose}>✕</button>

        {/* Modal Header */}
        <div style={{ padding: '28px 28px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: '4px' }}>DOCUMENT DETAILS</div>
              <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--ink)' }}>▤ {doc.name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', fontSize: '12px', color: 'var(--muted)' }}>
                <span>ID: <code style={{ fontSize: '11px', background: '#eef3f1', padding: '2px 5px', borderRadius: '4px' }}>{doc.id}</code></span>
                <span>•</span>
                <span>Created: {doc.created?.slice(0, 10)}</span>
                {doc.completed_at && (
                  <>
                    <span>•</span>
                    <span style={{ color: 'var(--accent)' }}>Completed: {new Date(doc.completed_at).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>
            <div>
              <StatusBadge status={doc.status} />
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="btngroup" style={{ marginTop: '16px', flexWrap: 'wrap', gap: '8px' }}>
            {isCompleted && doc.signed_filename ? (
              <a
                href={documentService.downloadSignedUrl(doc.id)}
                className="btn primary"
                download={`${doc.name}_signed.pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Download Signed PDF
              </a>
            ) : (
              <a
                href={documentService.downloadUrl(doc.id)}
                className="btn primary"
                download={`${doc.name}.pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Download PDF
              </a>
            )}

            {isCompleted && doc.certificate_id && (
              <a
                href={documentService.certificateUrl(doc.id)}
                className="btn"
                download={`Certificate_${doc.name}.pdf`}
                target="_blank"
                rel="noreferrer"
                title="Download official Certificate of Completion"
              >
                Completion Certificate
              </a>
            )}

            {isCompleted && (
              <button
                type="button"
                className="btn"
                onClick={() => setShowEmailForm(!showEmailForm)}
              >
                ✉ Email Document
              </button>
            )}

            {/* Cloud Storage Integration (Disabled with clear explanation as required) */}
            <button
              type="button"
              className="btn"
              disabled
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
              title="Cloud storage integration not configured. Documents are stored in secure local private storage."
            >
              ☁ Save to Cloud (Disabled)
            </button>
          </div>
        </div>

        {/* Inline Email Form */}
        {showEmailForm && (
          <div style={{ margin: '16px 28px', padding: '16px', background: '#f5faf8', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--ink)' }}>Email Completed Agreement</h4>
            <p className="dialognote" style={{ marginBottom: '12px' }}>
              Send a secure download link and execution notice to any verified email address.
            </p>
            <form onSubmit={handleSendEmail}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="formfield" style={{ margin: 0 }}>
                  <label htmlFor="email-to">Recipient Email *</label>
                  <input
                    id="email-to"
                    type="email"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="partner@example.com"
                    required
                  />
                </div>
                <div className="formfield" style={{ margin: 0 }}>
                  <label htmlFor="email-name">Recipient Name</label>
                  <input
                    id="email-name"
                    value={emailName}
                    onChange={(e) => setEmailName(e.target.value)}
                    placeholder="Partner Name"
                  />
                </div>
              </div>

              {emailError && <p style={{ color: '#b33232', fontSize: '12px', margin: '0 0 8px' }}>{emailError}</p>}
              {emailSuccess && <p style={{ color: 'var(--accent)', fontSize: '12px', margin: '0 0 8px' }}>{emailSuccess}</p>}

              <div className="btngroup" style={{ gap: '8px' }}>
                <button type="submit" className="btn primary" disabled={sendingEmail || !emailTo}>
                  {sendingEmail ? 'Sending…' : 'Send Email'}
                </button>
                <button type="button" className="btn" onClick={() => setShowEmailForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Content Body */}
        <div style={{ padding: '24px 28px' }}>
          {/* Recipient Status Timeline */}
          <div style={{ marginBottom: '28px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '16px', color: 'var(--ink)' }}>Recipient Status Timeline</h3>

            {recipients.length === 0 ? (
              <div style={{ padding: '18px', background: '#f9fbfa', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--muted)' }}>
                {doc.status === 'draft'
                  ? 'This document is a draft and has not yet been dispatched for signatures.'
                  : 'Self-signed document completed by the workspace owner.'}
              </div>
            ) : (
              <div className="timeline-container">
                {recipients.map((r, i) => {
                  let stepStatus = 'pending';
                  let statusLabel = 'Awaiting signature';
                  let statusColor = 'var(--muted)';
                  let icon = '◷';

                  if (r.status === 'signed') {
                    stepStatus = 'done';
                    statusLabel = `Signed on ${r.signed ? new Date(r.signed).toLocaleString() : 'completed'}`;
                    statusColor = 'var(--accent)';
                    icon = '✓';
                  } else if (r.viewed_at) {
                    stepStatus = 'viewed';
                    statusLabel = `Viewed on ${new Date(r.viewed_at).toLocaleString()}`;
                    statusColor = '#2563eb';
                    icon = '👁';
                  } else if (doc.request?.sequential_signing && i > 0 && recipients[i - 1]?.status !== 'signed') {
                    stepStatus = 'waiting';
                    statusLabel = `Waiting for previous signer (#${i})`;
                    statusColor = '#b45309';
                    icon = '⏳';
                  }

                  return (
                    <div key={r.id || i} className={`timeline-row ${stepStatus}`}>
                      <div className="timeline-badge" style={{ color: statusColor }}>
                        {icon}
                      </div>
                      <div className="timeline-body">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <strong>#{r.order || i + 1} {r.name}</strong>
                            <span style={{ color: 'var(--muted)', fontSize: '12px', marginLeft: '6px' }}>({r.email})</span>
                          </div>
                          <span className={`status ${r.status === 'signed' ? 'completed' : r.status}`}>
                            {r.status === 'signed' ? 'Signed' : r.viewed_at ? 'Viewed' : 'Pending'}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: statusColor, marginTop: '4px' }}>
                          {statusLabel}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cryptographic & Document Security Metadata */}
          <div style={{ marginBottom: '24px', padding: '16px', background: '#fafcfb', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ✦ Security & Integrity Verification
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px', fontSize: '12px' }}>
              <div>
                <span className="smallmuted" style={{ display: 'block' }}>ORIGINAL SHA-256 HASH</span>
                <code style={{ fontSize: '11px', wordBreak: 'break-all', color: '#172a2a' }}>{doc.sha256 || 'N/A'}</code>
              </div>
              {doc.final_sha256 && (
                <div>
                  <span className="smallmuted" style={{ display: 'block' }}>FINAL SEALED SHA-256 HASH</span>
                  <code style={{ fontSize: '11px', wordBreak: 'break-all', color: 'var(--accent)' }}>{doc.final_sha256}</code>
                </div>
              )}
              {doc.certificate_id && (
                <div>
                  <span className="smallmuted" style={{ display: 'block' }}>COMPLIANCE CERTIFICATE ID</span>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{doc.certificate_id}</span>
                </div>
              )}
            </div>
          </div>

          {/* Chronological Audit Trail */}
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: 'var(--ink)' }}>Audit Trail Chronology</h3>
            {doc.audit && doc.audit.length > 0 ? (
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <table style={{ margin: 0, fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: '#f5faf8' }}>
                      <th style={{ padding: '8px 12px' }}>Event</th>
                      <th style={{ padding: '8px 12px' }}>Actor</th>
                      <th style={{ padding: '8px 12px' }}>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.audit.map((a, i) => (
                      <tr key={a._id || i}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{a.event}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{a.user_id || 'System'}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{a.created ? new Date(a.created).toLocaleString() : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="smallmuted">No audit events recorded.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentDetailModal;
