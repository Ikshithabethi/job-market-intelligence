/**
 * Registration page.
 *
 * The API expects "fullName", "email" and "password"; the two role selects are
 * optional and are stored straight onto the new profile so the Career Path page
 * has a starting point. Location and experience are editable later on Profile.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { careerApi } from '../services/api';
import useApiData from '../hooks/useApiData';
import { useAuth } from '../context/AuthContext.jsx';
import { RoleSelect } from '../components/RoleSelect.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const options = useApiData((signal) => careerApi.options(signal), []);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    currentRoleId: null,
    targetRoleId: null,
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const roles = (options.data && options.data.roles) || [];

  const passwordProblem = useMemo(() => {
    const { password, confirmPassword } = form;
    if (!password && !confirmPassword) return null;
    if (password.length > 0 && password.length < 8) return 'Use at least 8 characters.';
    if (password.length > 72) return 'Use at most 72 characters.';
    if (password && !(/[A-Za-z]/.test(password) && /[0-9]/.test(password))) {
      return 'Include at least one letter and one number.';
    }
    if (confirmPassword && password !== confirmPassword) return 'The two passwords do not match.';
    return null;
  }, [form]);

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError(new Error('The two passwords do not match.'));
      return;
    }

    setSubmitting(true);
    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        currentRoleId: form.currentRoleId || undefined,
        targetRoleId: form.targetRoleId || undefined,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-title">Create an account</div>
        <p className="auth-subtitle">
          Saving your skills and career goals needs an account. The market analysis pages stay open
          without one.
        </p>

        {error && (
          <div className="banner banner-error" role="alert">
            <div>
              <span className="banner-title">Could not register.</span>
              {error.message}
              {error.details && error.details.length > 0 && (
                <ul className="reason-list">
                  {error.details.map((detail) => (
                    <li key={String(detail)}>{String(detail)}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <form onSubmit={onSubmit}>
          <label className="field">
            <span className="field-label">Full name</span>
            <input type="text" value={form.fullName} required onChange={update('fullName')} />
          </label>

          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              value={form.email}
              autoComplete="email"
              required
              onChange={update('email')}
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              value={form.password}
              autoComplete="new-password"
              required
              onChange={update('password')}
            />
            <span className="field-hint">
              At least 8 characters, including one letter and one number.
            </span>
          </label>

          <label className="field">
            <span className="field-label">Confirm password</span>
            <input
              type="password"
              value={form.confirmPassword}
              autoComplete="new-password"
              required
              onChange={update('confirmPassword')}
            />
          </label>

          {passwordProblem && <div className="field-hint">{passwordProblem}</div>}

          <div className="divider" />
          <div className="field-label">Career goals (optional)</div>

          <label className="field">
            <span className="field-label">Current role</span>
            <RoleSelect
              roles={roles}
              value={form.currentRoleId}
              onChange={(value) => setForm({ ...form, currentRoleId: value })}
              placeholder={options.loading ? 'Loading roles...' : 'Select your current role...'}
            />
          </label>

          <label className="field">
            <span className="field-label">Target role</span>
            <RoleSelect
              roles={roles}
              value={form.targetRoleId}
              onChange={(value) => setForm({ ...form, targetRoleId: value })}
              placeholder={options.loading ? 'Loading roles...' : 'Select the role you want...'}
            />
          </label>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting || Boolean(passwordProblem)}
          >
            {submitting ? 'Creating your account...' : 'Create account'}
          </button>
        </form>

        <div className="auth-footer">
          Already registered? <Link to="/login">Sign in</Link>.
        </div>
      </div>
    </div>
  );
}
