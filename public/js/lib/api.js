// Cliente HTTP con timeout y errores legibles.
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || 'Error');
    this.status = status;
    this.code = body?.error || 'error';
    this.fields = body?.fields || null;
  }
}

export async function api(path, { method = 'GET', body, timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      credentials: 'same-origin',
    });
  } catch (e) {
    throw new ApiError(0, { error: 'network', message: e.name === 'AbortError'
      ? 'El servidor tardó demasiado en responder. Revisá tu conexión e intentá de nuevo.'
      : 'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.' });
  } finally {
    clearTimeout(t);
  }
  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin cuerpo */ }
  if (!res.ok) throw new ApiError(res.status, data || { message: 'Ocurrió un error. Probá de nuevo.' });
  return data;
}
