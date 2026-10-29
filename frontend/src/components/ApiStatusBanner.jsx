/**
 * Backend connectivity notice.
 *
 * A junior-friendly project is much easier to debug when the UI says "the API is
 * not reachable" instead of every page failing with its own error. This renders
 * nothing while the API is healthy.
 */
import { useEffect, useState } from 'react';

import { systemApi, BASE_URL } from '../services/api';

export default function ApiStatusBanner() {
  const [state, setState] = useState({ status: 'checking', message: '' });

  useEffect(() => {
    const controller = new AbortController();

    systemApi
      .health(controller.signal)
      .then(({ data }) => {
        if (data && data.database === 'connected') {
          setState({ status: 'ok', message: '' });
        } else {
          setState({
            status: 'degraded',
            message: (data && data.database) || 'unknown',
          });
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState({ status: 'down', message: error.message });
      });

    return () => controller.abort();
  }, []);

  if (state.status === 'ok' || state.status === 'checking') return null;

  return (
    <div className="banner banner-error" role="alert">
      <div>
        <span className="banner-title">
          {state.status === 'down' ? 'Backend not reachable.' : 'Database not connected.'}
        </span>
        {state.status === 'down'
          ? 'Start the Express server (see the README) and confirm the API base URL.'
          : 'The API responded but reported that it cannot reach MySQL.'}{' '}
        Currently using <code>{BASE_URL}</code>.
        {state.message ? <div className="mt-1">{state.message}</div> : null}
      </div>
    </div>
  );
}
