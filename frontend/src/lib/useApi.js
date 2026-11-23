import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

/**
 * Fetch `path` (with `query`) and keep { data, meta, loading, error, reload }.
 * Re-fetches when the serialized query changes; ignores stale responses.
 */
export function useApi(path, query, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: enabled, error: null });
  const key = JSON.stringify(query || {});
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || !path) return;
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await api(path, { query: JSON.parse(key) });
      if (id === seq.current) setState({ data: r?.data ?? r, meta: r?.meta ?? null, loading: false, error: null });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, error }));
    }
  }, [path, key, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
