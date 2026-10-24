import { useState, useEffect } from 'react';
import { documentService } from '../../services/documentService.js';
import { toast } from '../../components/common/Toast.jsx';

export function ReportsPage() {
  const [stats, setStats] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([documentService.stats(), documentService.list()])
      .then(([s, d]) => { setStats(s); setDocs(d); })
      .catch((e) => toast(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  const completed = docs.filter((d) => d.status === 'completed').length;
  const inProgress = docs.filter((d) => d.status === 'in_progress').length;
  const completionRate = stats?.total > 0 ? Math.round((completed / stats.total) * 100) + '%' : '0%';

  const exportCSV = () => {
    const rows = [
      ['Name', 'Status', 'Created', 'Updated'],
      ...docs.map((d) => [d.name, d.status, d.created?.slice(0, 10), d.updated?.slice(0, 10)]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'maac-sign-report.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="content">
      <div className="heading">
        <div>
          <div className="eyebrow">MAAC SIGN / WORKSPACE</div>
          <h1 className="pagetitle">Reports</h1>
          <p className="subtitle">Monitor document activity and track your signing pipeline.</p>
        </div>
        <div className="btngroup">
          <button className="btn primary" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      <div className="metrics">
        {[
          { label: 'Total requests', value: stats?.total ?? 0 },
          { label: 'Completed', value: completed },
          { label: 'In progress', value: inProgress },
          { label: 'Completion rate', value: completionRate },
        ].map(({ label, value }) => (
          <div className="card" key={label}>
            <div className="metriclabel">{label}</div>
            <div className="metricvalue">{value}</div>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      {stats?.statuses?.length > 0 && (
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="sectiontop">
            <h3>Status breakdown</h3>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Status</th><th>Count</th></tr>
              </thead>
              <tbody>
                {stats.statuses.map((s) => (
                  <tr key={s.status}>
                    <td>{s.status?.replace(/_/g, ' ')}</td>
                    <td><strong>{s.count}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportsPage;
