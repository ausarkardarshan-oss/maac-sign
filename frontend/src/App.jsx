import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useSearchParams, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { Toast } from './components/common/Toast.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import AppHeader from './components/layout/AppHeader.jsx';

// Pages
import AuthPage from './pages/auth/AuthPage.jsx';
import DashboardPage from './pages/dashboard/DashboardPage.jsx';
import DocumentsPage from './pages/documents/DocumentsPage.jsx';
import RequestsPage from './pages/documents/RequestsPage.jsx';
import TemplatesPage from './pages/templates/TemplatesPage.jsx';
import SignFormsPage from './pages/signforms/SignFormsPage.jsx';
import ReportsPage from './pages/reports/ReportsPage.jsx';
import SettingsPage from './pages/settings/SettingsPage.jsx';
import SigningPage from './pages/signing/SigningPage.jsx';

/**
 * Main application layout for authenticated workspace routes.
 */
function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const isDocumentsPage = location.pathname === '/documents';
  const searchQuery = isDocumentsPage ? (searchParams.get('q') || '') : '';

  const handleSearch = (query) => {
    if (location.pathname === '/documents') {
      if (query && query.trim()) {
        setSearchParams({ q: query }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    } else {
      if (query && query.trim()) {
        navigate(`/documents?q=${encodeURIComponent(query)}`);
      } else {
        navigate('/documents');
      }
    }
  };

  return (
    <div className="app">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main">
        <AppHeader
          onMenuToggle={() => setSidebarOpen((v) => !v)}
          onSearch={handleSearch}
          searchQuery={searchQuery}
        />
        {children || <Outlet />}
      </main>
    </div>
  );
}

/**
 * Route protection wrapper requiring authenticated session.
 */
function ProtectedRoute({ children }) {
  const { user, authLoading, checkAuth } = useAuth();
  const location = useLocation();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (authLoading) {
    return (
      <div className="loading-center" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? <AppLayout>{children}</AppLayout> : <AppLayout><Outlet /></AppLayout>;
}

/**
 * Public route wrapper (redirects to dashboard if already authenticated).
 */
function PublicRoute({ children }) {
  const { user, authLoading, checkAuth } = useAuth();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (authLoading) {
    return (
      <div className="loading-center" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toast />
        <Routes>
          {/* Public Recipient Signing Link */}
          <Route path="/sign/:token" element={<SigningPage />} />

          {/* Authentication */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <AuthPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <AuthPage />
              </PublicRoute>
            }
          />
          <Route
            path="/auth"
            element={
              <PublicRoute>
                <AuthPage />
              </PublicRoute>
            }
          />

          {/* Protected Workspace Routes with Persistent Layout */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/signforms" element={<SignFormsPage />} />
            <Route path="/forms" element={<Navigate to="/signforms" replace />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
