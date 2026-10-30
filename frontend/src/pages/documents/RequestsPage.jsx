import { useState, useEffect } from 'react';
import { signingService } from '../../services/signingService.js';
import { toast } from '../../components/common/Toast.jsx';
import { documentService } from '../../services/documentService.js';
import SendWorkflow from '../../components/workflow/SendWorkflow.jsx';
import DocumentDetailModal from '../../components/modals/DocumentDetailModal.jsx';

function StatusBadge({ status }) {
  const cls = status?.replace(/_/g, '').replace(/\s+/g, '').toLowerCase();
  return <span className={`status ${cls}`}>{status?.replace(/_/g, ' ')}</span>;
}

export function RequestsPage() {
  const [requests, setRequests] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const load = async () => {
    try {
      const [reqData, docsData] = await Promise.all([
        signingService.listRequests(),
        documentService.list(),
      ]);
      setRequests(reqData);
      setDocs(docsData);
    } catch (err) {
      toast(err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const handleResend = async (r) => {
    setActionLoading(r.id);
    try {
      await signingService.resendRequest(r.id);
      toast(`Reminder email sent to recipient via Brevo SMTP`);
      load();
    } catch (err) {
      toast(err.message || 'Failed to resend reminder');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (r) => {
    if (!window.confirm(`Recall and void the signature request for "${r.document}"? The recipient link will be deactivated.`)) return;
    setActionLoading(r.id);
    try {
      await signingService.cancelRequest(r.id, 'Cancelled by sender');
      toast('Signature request cancelled and recipient link revoked');
      load();
    } catch (err) {
      toast(err.message || 'Failed to cancel request');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="content">
      <div className="heading">
        <div>
          <div className="eyebrow">MAAC SIGN / WORKSPACE</div>
          <h1 className="pagetitle">Signature Requests</h1>
          <p className="subtitle">Track all your signing invitations and their real-time delivery status.</p>
        </div>
        <div className="btngroup">
          <button className="btn primary" onClick={() => setShowSend(true)}>＋ New request</button>
        </div>
      </div>

      <div className="card tablecard">
        <div
          style={{
            background: '#eaf7f1',
            padding: '12px 25px',
            borderBottom: '1px solid var(--border)',
            fontSize: '12px',
            color: '#13624e',
            lineHeight: '1.6',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '15px' }}>✦</span>
          <span>Brevo SMTP active: Transactional invitations, reminders, and execution certificates are delivered directly to recipient inboxes.</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Subject</th>
                <th>Recipients & Status</th>
                <th>Overall Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={6} className="empty">No signing requests yet. Upload a document and send it for signatures.</td></tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id}>
                    <td
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedDocId(r.document_id)}
                      title="Click to view details and status timeline"
                    >
                      <strong>▤ &nbsp;{r.document}</strong>
                    </td>
                    <td>{r.subject}</td>
                    <td>
                      {Array.isArray(r.recipients) && r.recipients.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {r.recipients.map((rec, idx) => (
                            <div key={rec.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                              <span>#{rec.order || idx + 1} <strong>{rec.name}</strong></span>
                              <span style={{ color: 'var(--muted)', fontSize: '11px' }}>({rec.email})</span>
                              <span className={`status ${rec.status === 'signed' ? 'completed' : rec.status}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                                {rec.status === 'signed' ? 'Signed' : rec.viewed_at ? 'Viewed' : 'Pending'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span>{r.recipients_summary || 'No recipients'}</span>
                      )}
                    </td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{r.created?.slice(0, 10)}</td>
                    <td>
                      <div className="btngroup">
                        <button
                          className="btn primary"
                          onClick={() => setSelectedDocId(r.document_id)}
                        >
                          Details
                        </button>
                        {r.status === 'pending' && (
                          <>
                            <button
                              className="btn"
                              disabled={actionLoading === r.id}
                              onClick={() => handleResend(r)}
                              title="Resend email reminder via Brevo SMTP"
                            >
                              {actionLoading === r.id ? 'Sending…' : 'Resend Email'}
                            </button>
                            <button
                              className="btn"
                              disabled={actionLoading === r.id}
                              onClick={() => handleCancel(r)}
                              title="Recall signature request"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {r.status === 'completed' && (
                          <>
                            <a
                              href={documentService.downloadSignedUrl(r.document_id)}
                              className="btn"
                              download={`${r.document}_signed.pdf`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Signed PDF
                            </a>
                            {r.certificate_id && (
                              <a
                                href={documentService.certificateUrl(r.document_id)}
                                className="btn"
                                download={`Certificate_${r.document}.pdf`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Certificate
                              </a>
                            )}
                          </>
                        )}
                        {r.status === 'recalled' && (
                          <span className="smallmuted">Link revoked</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showSend && (
        <SendWorkflow
          docs={docs}
          onClose={() => setShowSend(false)}
          onSuccess={() => { setShowSend(false); load(); }}
        />
      )}

      {selectedDocId && (
        <DocumentDetailModal
          docId={selectedDocId}
          onClose={() => setSelectedDocId(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}

export default RequestsPage;
