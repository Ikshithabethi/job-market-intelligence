/**
 * Route guard for pages that need an account (profile, saved roadmaps, ...).
 * While the stored token is being re-validated we render a loading state instead
 * of bouncing the user to the login page on every refresh.
 */
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { LoadingBlock } from './StateBlocks';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, initialising } = useAuth();
  const location = useLocation();

  if (initialising) {
    return (
      <div className="card">
        <LoadingBlock message="Checking your session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
