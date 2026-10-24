import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { NotificationDropdown } from './NotificationDropdown.jsx';

const PAGE_LABELS = {
  '/dashboard': 'Overview',
  '/documents': 'Documents',
  '/requests': 'Requests',
  '/templates': 'Templates',
  '/signforms': 'SignForms',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

function getInitials(name) {
  if (!name) return 'DA';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AppHeader({ onMenuToggle, onSearch, searchQuery = '' }) {
  const location = useLocation();
  const { user } = useAuth();
  const label = PAGE_LABELS[location.pathname] || 'Workspace';

  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  const [inputVal, setInputVal] = useState(searchQuery || '');

  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery);
    setInputVal(searchQuery || '');
  }

  const handleChange = (e) => {
    const next = e.target.value;
    setInputVal(next);
    onSearch?.(next);
  };

  const handleClear = () => {
    setInputVal('');
    onSearch?.('');
  };

  return (
    <header>
      <button className="mobilemenu" id="mobilemenu" onClick={onMenuToggle} aria-label="Toggle menu">☰</button>
      <div className="crumb">
        Workspace <span>/</span> <strong id="crumb">{label}</strong>
      </div>
      <div className="headeractions">
        <label className="search" htmlFor="search-input" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span>⌕</span>
          <input
            id="search-input"
            placeholder="Search documents..."
            aria-label="Search documents"
            value={inputVal}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                handleClear();
              }
            }}
          />
          {inputVal && (
            <button
              type="button"
              className="iconbtn"
              onClick={handleClear}
              title="Clear search"
              aria-label="Clear search"
              style={{
                fontSize: '13px',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '0 2px',
                color: 'inherit',
                opacity: 0.65,
              }}
            >
              ✕
            </button>
          )}
        </label>
        <NotificationDropdown />
        <div className="avatar small">{getInitials(user?.name)}</div>
      </div>
    </header>
  );
}
export default AppHeader;
