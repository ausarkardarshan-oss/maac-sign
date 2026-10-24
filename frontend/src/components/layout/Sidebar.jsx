import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { toast } from '../common/Toast.jsx';

const NAV_ITEMS = [
  { page: '/dashboard', label: 'Overview', icon: '◫' },
  { page: '/documents', label: 'Documents', icon: '▤' },
  { page: '/requests', label: 'Requests', icon: '➤' },
  { page: '/templates', label: 'Templates', icon: '▣' },
  { page: '/signforms', label: 'SignForms', icon: '⌁' },
  { page: '/reports', label: 'Reports', icon: '▥' },
];

function getInitials(name) {
  if (!name) return 'DA';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Sidebar({ isOpen, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const displayName = user?.name || 'Darshan Ausarkar';
  const initials = getInitials(displayName);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      toast('Logout failed');
    }
  };

  const handleNav = (page) => {
    navigate(page);
    onClose?.();
  };

  return (
    <aside className={`sidebar${isOpen ? ' open' : ''}`}>
      <div className="brand">
        <div className="brandmark">✦</div>
        <span>maac<span className="brandlight">sign</span></span>
      </div>

      <div className="navlabel">WORKSPACE</div>
      <nav>
        {NAV_ITEMS.map(({ page, label, icon }) => (
          <button
            key={page}
            data-page={page}
            className={location.pathname === page ? 'active' : ''}
            onClick={() => handleNav(page)}
          >
            <span className="navicon">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="navlabel lower">ACCOUNT</div>
      <nav>
        <button
          data-page="/settings"
          className={location.pathname === '/settings' ? 'active' : ''}
          onClick={() => handleNav('/settings')}
        >
          <span className="navicon">⚙</span>
          <span>Settings</span>
        </button>
      </nav>

      <div className="sidebardivider" />

      <div className="sidebarbottom">
        <div className="avatar">{initials}</div>
        <div className="sidebaruserinfo">
          <b>{displayName}</b>
          <button
            type="button"
            className="signoutbtn"
            onClick={handleLogout}
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
