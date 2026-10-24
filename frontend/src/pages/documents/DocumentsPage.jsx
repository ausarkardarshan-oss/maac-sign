import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { documentService } from '../../services/documentService.js';
import { toast } from '../../components/common/Toast.jsx';
import Modal from '../../components/modals/Modal.jsx';
import UploadModal from '../dashboard/UploadModal.jsx';
import SendModal from '../dashboard/SendModal.jsx';

const ALL_FILTERS = ['All', 'in_progress', 'completed', 'draft', 'recalled', 'declined'];
const FILTER_LABELS = {
  All: 'All',
  in_progress: 'In progress',
  completed: 'Completed',
  draft: 'Draft',
  recalled: 'Recalled',
  declined: 'Declined',
};

function StatusBadge({ status }) {
  const cls = status?.replace(/_/g, '').replace(/\s+/g, '').toLowerCase();
  return <span className={`status ${cls}`}>{status?.replace(/_/g, ' ')}</span>;
}

function AuditModal({ docId, onClose }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    documentService.audit(docId)
      .then(setEvents)
      .catch((e) => setError(e.message));
  }, [docId]);

  return (
    <Modal title="Audit trail" onClose={onClose}>
      {error && <p style={{ color: '#b33232' }}>{error}</p>}
      {!events && !error && <div className="loading-center"><div className="spinner" /></div>}
      {events && (
        <pre style={{ overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: '11px', maxHeight: '50vh' }}>
          {JSON.stringify(events, null, 2)}
        </pre>
      )}
    </Modal>
  );
}

function RenameModal({ doc, onClose, onSuccess }) {
  const [name, setName] = useState(doc.name);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await documentService.rename(doc.id, name.trim());
      toast('Document renamed');
      onSuccess();
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Rename document" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="formfield">
          <label htmlFor="rename-input">Document name</label>
          <input
            id="rename-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={150}
            autoFocus
          />
        </div>
        <div className="btngroup" style={{ marginTop: '16px' }}>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export function DocumentsPage({ searchQuery: propQuery }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const searchQuery = (propQuery !== undefined ? propQuery : urlQuery).trim();

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [modal, setModal] = useState(null); // { type, doc? }

  const load = async () => {
    try {
      const data = await documentService.list();
      setDocs(data);
    } catch (err) {
      toast(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const q = searchQuery.toLowerCase();
  const filtered = docs.filter((d) => {
    const matchesFilter = filter === 'All' || d.status === filter;
    if (!matchesFilter) return false;
    if (!q) return true;

    const nameMatch = d.name?.toLowerCase().includes(q);
    const statusRaw = (d.status || '').toLowerCase();
    const statusClean = statusRaw.replace(/_/g, ' ');
    const statusMatch = statusRaw.includes(q) || statusClean.includes(q);
    const idMatch = d.id?.toLowerCase().includes(q);
    const dateMatch = d.created?.slice(0, 10).includes(q);

    return nameMatch || statusMatch || idMatch || dateMatch;
  });

  const handleClearSearch = () => {
    setSearchParams({}, { replace: true });
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.name}" permanently?`)) return;
    try {
      await documentService.delete(doc.id);
      toast('Document deleted');
      load();
    } catch (err) {
      toast(err.message);
    }
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="content">
      <div className="heading">
        <div>
          <div className="eyebrow">MAAC SIGN / WORKSPACE</div>
          <h1 className="pagetitle">Documents</h1>
          <p className="subtitle">Organize, review, and track every agreement.</p>
        </div>
        <div className="btngroup">
          <button className="btn primary" onClick={() => setModal({ type: 'upload' })}>＋ Upload document</button>
          <button className="btn" onClick={() => setModal({ type: 'send' })}>Send for signatures</button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
        <div className="filterbar" style={{ marginBottom: 0 }}>
          {ALL_FILTERS.map((f) => (
            <button
              key={f}
              className={`chip${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        {searchQuery && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted)' }}>
            <span>
              Searching: <strong style={{ color: 'var(--ink)' }}>&ldquo;{searchQuery}&rdquo;</strong> ({filtered.length} found)
            </span>
            <button
              type="button"
              className="chip"
              onClick={handleClearSearch}
              style={{ cursor: 'pointer', padding: '6px 11px', fontSize: '11px', fontWeight: 600 }}
              title="Clear search"
            >
              ✕ Clear search
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card tablecard">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Document name</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    {docs.length === 0 ? (
                      'No documents yet. Upload your first PDF.'
                    ) : searchQuery ? (
                      <div style={{ padding: '20px 0' }}>
                        <p style={{ margin: '0 0 12px', fontSize: '14px' }}>
                          No documents match &ldquo;<strong>{searchQuery}</strong>&rdquo;
                          {filter !== 'All' ? ` with filter "${FILTER_LABELS[filter]}"` : ''}.
                        </p>
                        <div className="btngroup" style={{ justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="btn primary"
                            onClick={handleClearSearch}
                          >
                            Clear search
                          </button>
                          {filter !== 'All' && (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => setFilter('All')}
                            >
                              Reset status filter
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '20px 0' }}>
                        <p style={{ margin: '0 0 12px', fontSize: '14px' }}>
                          No documents found with status &ldquo;{FILTER_LABELS[filter]}&rdquo;.
                        </p>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setFilter('All')}
                        >
                          Show all documents
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id}>
                    <td><strong>▤ &nbsp;{d.name}</strong></td>
                    <td><StatusBadge status={d.status} /></td>
                    <td>{d.created?.slice(0, 10)}</td>
                    <td>
                      <div className="btngroup">
                        {d.status === 'completed' && d.signed_filename ? (
                          <>
                            <a
                              href={documentService.downloadSignedUrl(d.id)}
                              className="btn primary"
                              download={`${d.name}_signed.pdf`}
                              target="_blank"
                              rel="noreferrer"
                              title="Download executed PDF with verified signatures"
                            >
                              Signed PDF
                            </a>
                            {d.certificate_id && (
                              <a
                                href={documentService.certificateUrl(d.id)}
                                className="btn"
                                download={`Certificate_${d.name}.pdf`}
                                target="_blank"
                                rel="noreferrer"
                                title="Download official Certificate of Completion"
                              >
                                Certificate
                              </a>
                            )}
                            <a
                              href={documentService.downloadUrl(d.id)}
                              className="btn"
                              download={`${d.name}.pdf`}
                              target="_blank"
                              rel="noreferrer"
                              title="Download original uploaded document"
                            >
                              Original
                            </a>
                          </>
                        ) : (
                          <a
                            href={documentService.downloadUrl(d.id)}
                            className="btn"
                            download={`${d.name}.pdf`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                        )}
                        <button className="btn" onClick={() => setModal({ type: 'audit', doc: d })}>Audit</button>
                        {d.status === 'draft' && <>
                          <button className="btn" onClick={() => setModal({ type: 'rename', doc: d })}>Rename</button>
                          <button className="btn" onClick={() => handleDelete(d)}>Delete</button>
                        </>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {modal?.type === 'upload' && (
        <UploadModal onClose={() => setModal(null)} onSuccess={() => { setModal(null); load(); }} />
      )}
      {modal?.type === 'send' && (
        <SendModal docs={docs.filter((d) => d.status === 'draft')} onClose={() => setModal(null)} onSuccess={() => { setModal(null); load(); }} />
      )}
      {modal?.type === 'audit' && (
        <AuditModal docId={modal.doc.id} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'rename' && (
        <RenameModal doc={modal.doc} onClose={() => setModal(null)} onSuccess={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}

export default DocumentsPage;
