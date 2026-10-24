import { useEffect, useState } from 'react';
import type { API } from '../useApi';
import { errorMessage } from '../lib/api';
export function useLoad(api: API, path: string | null, tick = 0) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    setData(null);
    setError('');
    if (!path) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    api(path, 'GET', undefined, false, { signal: controller.signal })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active && e.name !== 'AbortError') setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, path, tick]);
  return { data, error, loading };
}
