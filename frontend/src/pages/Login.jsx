/**
 * Login page.
 *
 * Posts to POST /api/auth/login, and on success the AuthContext stores the JWT
 * and the user object. If the user was redirected here from a protected page,
 * they are sent back to it.
 */
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state && location.state.from) || '/';

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-title">Job Market Intelligence</div>
        <p className="auth-subtitle">
          Sign in to save skills, career goals and roadmaps to your account.
        </p>

        {error && (
          <div className="banner banner-error" role="alert">
            <div>
              <span className="banner-title">Could not sign in.</span>
              {error.message}
            </div>
          </div>
        )}

        <form onSubmit={onSubmit}>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="demo-hint">
          The seeder creates a demo account and prints its email and password to the terminal when
          you run <code>npm run seed</code> in the backend folder. Use those credentials here, or
          register a new account.
        </div>

        <div className="auth-footer">
          No account yet? <Link to="/register">Create one</Link>.
          <br />
          You can also use the market analysis pages without signing in.
        </div>
      </div>
    </div>
  );
}
