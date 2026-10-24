import { useState, useEffect } from 'react';
import { templateService } from '../../services/templateService.js';
import { documentService } from '../../services/documentService.js';
import { toast } from '../../components/common/Toast.jsx';
import Modal from '../../components/modals/Modal.jsx';

function CreateModal({ kind, docs, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !documentId) return;
    setLoading(true);
    try {
      if (kind === 'template') {
        await templateService.createTemplate({ name: name.trim(), documentId });
      } else {
        await templateService.createForm({ name: name.trim(), documentId });
      }
      toast(`${kind === 'template' ? 'Template' : 'SignForm'} created`);
      onSuccess();
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`Create ${kind === 'template' ? 'template' : 'SignForm'}`} onClose={onClose}>
      <p className="dialognote">
        {kind === 'template'
          ? 'Create a reusable template from one of your documents.'
          : 'Create a SignForm record from one of your documents.'}
      </p>
      <form onSubmit={handleSubmit}>
        <div className="formfield">
          <label htmlFor="create-name">Name</label>
          <input
            id="create-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`${kind === 'template' ? 'Template' : 'SignForm'} name`}
            required
          />
        </div>
        <div className="formfield">
          <label htmlFor="create-doc">Source document</label>
          <select id="create-doc" value={documentId} onChange={(e) => setDocumentId(e.target.value)} required>
            <option value="">Choose a document</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="btngroup" style={{ marginTop: '16px' }}>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Creating…' : 'Create'}
          </button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    try {
      const [tpl, allDocs] = await Promise.all([templateService.listTemplates(), documentService.list()]);
      setTemplates(tpl);
      setDocs(allDocs);
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="content">
      <div className="heading">
        <div>
          <div className="eyebrow">MAAC SIGN / WORKSPACE</div>
          <h1 className="pagetitle">Templates</h1>
          <p className="subtitle">Create reusable agreements with preconfigured fields and recipients.</p>
        </div>
        <div className="btngroup">
          <button className="btn primary" onClick={() => setShowCreate(true)}>＋ New template</button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="featureempty">
          <div className="illustration">▣</div>
          <h2>No templates yet</h2>
          <p>Create reusable agreements with preconfigured fields and recipients. Create your first one to get started.</p>
          <button className="btn primary" onClick={() => setShowCreate(true)}>Create template</button>
        </div>
      ) : (
        <div className="metrics">
          {templates.map((t) => (
            <div className="card" key={t.id}>
              <span className="metricicon">▣</span>
              <h3 style={{ margin: '12px 0 4px', fontSize: '14px' }}>{t.name}</h3>
              <p className="smallmuted">{t.document}</p>
              <p className="smallmuted">{t.created?.slice(0, 10)}</p>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          kind="template"
          docs={docs}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

export default TemplatesPage;
