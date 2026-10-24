import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export function AuthPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register({ name: form.name, email: form.email, password: form.password });
      } else {
        await login({ email: form.email, password: form.password });
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegister((v) => !v);
    setError('');
    setForm({ name: '', email: '', password: '' });
  };

  return (
    <div className="authwrap">
      <div className="authbox">
        <h1>✦ MAAC AI Sign</h1>
        <p>Secure document signing workspace</p>

        <form onSubmit={handleSubmit} noValidate>
          {isRegister && (
            <div className="authfield">
              <label htmlFor="auth-name">Full name</label>
              <input
                id="auth-name"
                name="name"
                type="text"
                placeholder="Your full name"
                value={form.name}
                onChange={handleChange}
                autoComplete="name"
                required={isRegister}
              />
            </div>
          )}

          <div className="authfield">
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>

          <div className="authfield">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              name="password"
              type="password"
              placeholder={isRegister ? 'Minimum 12 characters' : 'Your password'}
              value={form.password}
              onChange={handleChange}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
            />
          </div>

          <p className="autherror" role="alert">{error}</p>

          <button
            type="submit"
            className="authsubmit"
            disabled={loading}
            id="auth-submit"
          >
            {loading ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button className="authswitch" onClick={toggleMode} id="auth-switch" type="button">
          {isRegister ? 'Already have an account? Sign in' : 'Create an account'}
        </button>
      </div>
    </div>
  );
}

export default AuthPage;
