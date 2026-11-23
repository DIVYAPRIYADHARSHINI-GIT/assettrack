// Tiny fetch wrapper: adds the JWT, parses JSON errors, and reports slow first
// requests so the UI can show "Waking up the server..." (Render free sleeps).

// Empty VITE_API_URL = same origin (production: the backend serves this frontend).
// In local dev set VITE_API_URL=http://localhost:4000 (see .env.example).
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const TOKEN_KEY = 'assettrack-token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)),
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
    this.fields = details?.fields || {};
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

// Listeners told when a request has been pending a while (cold start).
const slowListeners = new Set();
export const onSlowRequest = (fn) => {
  slowListeners.add(fn);
  return () => slowListeners.delete(fn);
};
let pendingSlow = 0;
const emitSlow = () => slowListeners.forEach((fn) => fn(pendingSlow > 0));

export async function api(path, { method = 'GET', body, query, raw = false, signal, timeoutMs = 90_000 } = {}) {
  const url = new URL(API_URL + '/api' + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
      url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
  }
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  const timeout = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  let slow = false;
  const slowTimer = setTimeout(() => {
    slow = true;
    pendingSlow++;
    emitSlow();
  }, 4000);

  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, signal: controller.signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    if (controller.signal.reason?.name === 'TimeoutError') {
      throw new ApiError(0, 'The server took too long to respond. It may be waking up - please try again.');
    }
    throw new ApiError(0, 'Cannot reach the server. Check your connection or try again in a moment.');
  } finally {
    clearTimeout(timeout);
    clearTimeout(slowTimer);
    signal?.removeEventListener('abort', abort);
    if (slow) {
      pendingSlow--;
      emitSlow();
    }
  }

  if (raw && res.ok) return res;
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = data?.error?.message || `Request failed (${res.status})`;
    if (res.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized(message);
    throw new ApiError(res.status, message, data?.error?.details);
  }
  return data;
}

/** Download a file response (CSV) using the server's filename. */
export async function download(path, query, fallbackName = 'download.csv') {
  const res = await api(path, { query, raw: true });
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const name = cd.match(/filename="?([^";]+)"?/)?.[1] || fallbackName;
  saveBlob(blob, name);
  return { name, count: Number(res.headers.get('x-total-count')) || undefined };
}

export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
