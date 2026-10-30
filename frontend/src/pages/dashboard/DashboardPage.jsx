import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { documentService } from '../../services/documentService.js';
import { toast } from '../../components/common/Toast.jsx';
import SendWorkflow from '../../components/workflow/SendWorkflow.jsx';
import SelfSignWorkflow from '../../components/workflow/SelfSignWorkflow.jsx';

function StatusBadge({ status }) {
  const cls = status?.replace(/_/g, '').replace(/\s+/g, '').toLowerCase();
  return <span className={`status ${cls}`}>{status?.replace(/_/g, ' ')}</span>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, statuses: [] });
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'send' | 'selfsign' | 'menu'

  const load = async () => {
    try {
      const [statsData, docsData] = await Promise.all([
        documentService.stats(),
        documentService.list(),
      ]);
      setStats(statsData);
      setDocs(docsData);
    } catch (err) {
      toast(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const countByStatus = (s) => docs.filter((d) => d.status === s).length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="content">
      {/* Heading */}
      <div className="heading">
        <div>
          <div className="eyebrow">MAAC SIGN / WORKSPACE</div>
          <h1 className="pagetitle">{greeting} ✨</h1>
          <p className="subtitle">Here&rsquo;s what&rsquo;s happening with your documents today.</p>
        </div>
        <div className="btngroup">
          {/* Action menu button */}
          <div style={{ position: 'relative' }}>
            <button
              id="action-menu-btn"
              className="btn primary"
              onClick={() => setModal(modal === 'menu' ? null : 'menu')}
            >
              ＋ New
            </button>
            {modal === 'menu' && (
              <div className="action-menu" id="action-menu-dropdown">
                <button
                  className="action-menu-item"
                  id="action-send-sigs"
                  onClick={() => setModal('send')}
                >
                  <span className="action-menu-icon">➤</span>
                  <div>
                    <b>Send for signatures</b>
                    <small>Request signatures from others</small>
                  </div>
                </button>
                <button
                  className="action-menu-item"
                  id="action-sign-yourself"
                  onClick={() => setModal('selfsign')}
                >
                  <span className="action-menu-icon">✒</span>
                  <div>
                    <b>Sign yourself</b>
                    <small>Upload and sign a document yourself</small>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="metrics">
        {[
          { label: 'Total documents', value: stats.total, icon: '▤' },
          { label: 'Awaiting signatures', value: countByStatus('in_progress'), icon: '◷' },
          { label: 'Completed', value: countByStatus('completed'), icon: '✓' },
          { label: 'Drafts', value: countByStatus('draft'), icon: '▧' },
        ].map((m) => (
          <div className="card" key={m.label}>
            <span className="metricicon">{m.icon}</span>
            <div className="metriclabel">{m.label}</div>
            <div className="metricvalue">{m.value}</div>
            <div className="metricfoot">Your workspace</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid2">
        {/* Quick actions */}
        <div className="card">
          <div className="sectiontop">
            <h3>Quick actions</h3>
          </div>
          <div className="quickgrid">
            <button className="quick" id="quick-send-sigs" onClick={() => setModal('send')}>
              <div className="symbol">➤</div>
              <b>Send for signatures</b>
              <small>Prepare and request a signature</small>
            </button>
            <button className="quick" id="quick-sign-yourself" onClick={() => setModal('selfsign')}>
              <div className="symbol">✒</div>
              <b>Sign yourself</b>
              <small>Upload and sign a document</small>
            </button>
          </div>
        </div>

        {/* Recent activity */}
        <div className="card">
          <div className="sectiontop">
            <h3>Recent activity</h3>
            <button className="link" onClick={() => navigate('/documents')}>View all</button>
          </div>
          <div className="activity">
            {docs.slice(0, 4).length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '13px' }}>No documents yet.</p>
            ) : (
              docs.slice(0, 4).map((d) => (
                <div className="event" key={d.id}>
                  <span className="eventdot" />
                  <div>
                    <b>{d.name}</b>
                    <p>{d.status?.replace(/_/g, ' ')} · {d.created?.slice(0, 10)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent documents table */}
      <div className="card tablecard">
        <div className="tablehead">
          <h3 style={{ margin: 0, fontSize: '15px' }}>
            Documents <span className="smallmuted">({docs.length})</span>
          </h3>
          <button className="link" onClick={() => navigate('/documents')}>View all →</button>
        </div>
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
              {docs.slice(0, 6).length === 0 ? (
                <tr><td colSpan={4} className="empty">No documents yet. Upload your first document.</td></tr>
              ) : (
                docs.slice(0, 6).map((d) => (
                  <tr key={d.id}>
                    <td><strong>▤ &nbsp;{d.name}</strong></td>
                    <td><StatusBadge status={d.status} /></td>
                    <td>{d.created?.slice(0, 10)}</td>
                    <td>
                      <button className="link" onClick={() => navigate('/documents')}>View →</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {modal === 'send' && (
        <SendWorkflow
          docs={docs}
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); load(); }}
        />
      )}
      {modal === 'selfsign' && (
        <SelfSignWorkflow
          docs={docs}
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); load(); }}
        />
      )}

      {/* Click outside to close action menu */}
      {modal === 'menu' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 0 }} onClick={() => setModal(null)} />
      )}
    </div>
  );
}

export default DashboardPage;
