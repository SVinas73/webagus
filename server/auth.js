// Autenticación del panel: contraseña única (ADMIN_PASSWORD) + cookie de sesión
// firmada con HMAC, httpOnly, SameSite=Strict. Las rutas que modifican datos
// exigen además el encabezado X-Requested-With (defensa CSRF adicional).
import crypto from 'node:crypto';
import { config } from './config.js';
import { HttpError } from './lib/errors.js';

const COOKIE = 'adm';
const TTL_MS = 12 * 3600_000;

function sign(payload) {
  return crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba); // tiempo constante igualmente
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export function checkPassword(pw) {
  if (!config.adminPassword) return false;
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  return safeEqual(h(pw), h(config.adminPassword));
}

export function issueSession(res) {
  const exp = Date.now() + TTL_MS;
  const payload = `${exp}.${crypto.randomBytes(8).toString('hex')}`;
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: 'strict', secure: config.isProd, maxAge: TTL_MS, path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function isAuthenticated(req) {
  const v = readCookie(req, COOKIE);
  if (!v) return false;
  const lastDot = v.lastIndexOf('.');
  const payload = v.slice(0, lastDot);
  const sig = v.slice(lastDot + 1);
  if (!payload || !safeEqual(sig, sign(payload))) return false;
  return Number(payload.split('.')[0]) > Date.now();
}

export function requireAdmin(req, _res, next) {
  if (!isAuthenticated(req)) return next(new HttpError(401, 'unauthorized', 'Sesión no válida.'));
  if (req.method !== 'GET' && req.get('x-requested-with') !== 'fetch') {
    return next(new HttpError(403, 'csrf', 'Solicitud rechazada.'));
  }
  next();
}

/** Limitador simple en memoria por IP. */
export function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, _res, next) => {
    const key = req.ip || 'x';
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return next(); }
    if (++h.n > max) return next(new HttpError(429, 'rate_limited', message || 'Demasiadas solicitudes. Probá de nuevo en unos minutos.'));
    next();
  };
}
