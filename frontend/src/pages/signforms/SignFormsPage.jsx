import { useState, useEffect } from 'react';
import { templateService } from '../../services/templateService.js';
import { documentService } from '../../services/documentService.js';
import { toast } from '../../components/common/Toast.jsx';
import Modal from '../../components/modals/Modal.jsx';

function CreateFormModal({ docs, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !documentId) return;
    setLoading(true);
    try {
      await templateService.createForm({ name: name.trim(), documentId });
      toast('SignForm created');
      onSuccess();
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Create SignForm" onClose={onClose}>
      <p className="dialognote">
        Create a SignForm record. Public signing form submission requires additional development.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="formfield">
          <label htmlFor="form-name">SignForm name</label>
          <input
            id="form-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="SignForm name"
            required
          />
        </div>
        <div className="formfield">
          <label htmlFor="form-doc">Source document</label>
          <select id="form-doc" value={documentId} onChange={(e) => setDocumentId(e.target.value)} required>
            <option value="">Choose a document</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="btngroup" style={{ marginTop: '16px' }}>
          <button type="submit" className="btn primary" disabled={loading}>{loading ? 'Creating…' : 'Create'}</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export function SignFormsPage() {
  const [forms, setForms] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    try {
      const [fData, allDocs] = await Promise.all([templateService.listForms(), documentService.list()]);
      setForms(fData);
      setDocs(allDocs);
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const handleDelete = async (form) => {
    const targetId = form?.id || form?._id;
    if (!targetId) {
      toast('Cannot remove SignForm: missing ID');
      return;
    }
    if (!window.confirm(`Remove SignForm "${form.name}"?`)) return;
    try {
      await templateService.deleteForm(targetId);
      toast('SignForm removed');
      load();
    } catch (err) {
      toast(err.message || 'Failed to remove SignForm');
    }
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="content">
      <div className="heading">
        <div>
          <div className="eyebrow">MAAC SIGN / WORKSPACE</div>
          <h1 className="pagetitle">SignForms</h1>
          <p className="subtitle">Collect signatures through a shareable public form experience.</p>
        </div>
        <div className="btngroup">
          <button className="btn primary" onClick={() => setShowCreate(true)}>＋ New SignForm</button>
        </div>
      </div>

      {forms.length === 0 ? (
        <div className="featureempty">
          <div className="illustration">⌁</div>
          <h2>No SignForms yet</h2>
          <p>Collect signatures through a shareable public form experience. Create your first one to get started.</p>
          <button className="btn primary" onClick={() => setShowCreate(true)}>Create SignForm</button>
        </div>
      ) : (
        <div className="metrics">
          {forms.map((f) => (
            <div className="card" key={f.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <span className="metricicon">⌁</span>
                <h3 style={{ margin: '12px 0 4px', fontSize: '15px', wordBreak: 'break-word' }}>{f.name}</h3>
                <p className="smallmuted" style={{ margin: '4px 0' }}>▤ {f.document}</p>
                <p className="smallmuted" style={{ margin: '4px 0 16px' }}>Created: {f.created?.slice(0, 10)}</p>
              </div>
              <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ width: '100%', fontSize: '12px', padding: '8px 12px', color: '#c93b3b' }}
                  onClick={() => handleDelete(f)}
                  title={`Remove ${f.name}`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateFormModal docs={docs} onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}

export default SignFormsPage;
