/**
 * Data fetching hook with explicit loading / error / empty handling.
 *
 * Usage:
 *   const { data, loading, error, reload } = useApiData(
 *     (signal) => analyticsApi.dashboard(signal),
 *     []
 *   );
 *
 * `deps` controls when the request is repeated (same idea as useEffect deps).
 * Aborting on unmount/dependency change keeps a fast filter change from racing
 * an older response.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useApiData(fetcher, deps = [], { enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const [reloadCount, setReloadCount] = useState(0);

  // Keep the latest fetcher in a ref so callers can pass an inline arrow
  // function without causing an infinite fetch loop.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (!active) return;
        setData(result.data);
        setMeta(result.meta || {});
      })
      .catch((caught) => {
        if (!active || caught.name === 'AbortError') return;
        setError(caught);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reloadCount, ...deps]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  return { data, meta, loading, error, reload, setData };
}

export default useApiData;
