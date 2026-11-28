import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../api/axios';

/**
 * Runs an async fetcher and tracks { data, loading, error }.
 * Re-runs whenever `deps` change; `reload()` refetches without clearing data.
 */
export function useApi(fetcher, deps = [], { initialData = null, enabled = true } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const callId = useRef(0);

  const run = useCallback(async () => {
    const id = ++callId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (id === callId.current) setData(result);
    } catch (e) {
      if (id === callId.current) setError(getErrorMessage(e));
    } finally {
      if (id === callId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (enabled) run();
  }, [run, enabled]);

  return { data, setData, loading, error, reload: run };
}
