// KELA OS – API-klient. Skickar alltid säkerhetsheadern och hanterar utloggning centralt.
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Fel ${status}`);
    this.status = status; this.code = body?.error; this.details = body?.details;
  }
}

let onAuthLost = () => {};
export function setAuthLostHandler(fn) { onAuthLost = fn; }

export async function api(path, { method = 'GET', body, raw } = {}) {
  const res = await fetch('/api/os' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'x-kela-os': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (raw && res.ok) return res;
  let data = null;
  try { data = await res.json(); } catch { /* tomt svar */ }
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    if (res.status === 401 && !path.startsWith('/auth/')) onAuthLost(err);
    throw err;
  }
  return data;
}

export const get = (p) => api(p);
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const patch = (p, body = {}) => api(p, { method: 'PATCH', body });
export const del = (p) => api(p, { method: 'DELETE' });
export const qs = (o) => {
  const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const t = s.toString();
  return t ? '?' + t : '';
};
