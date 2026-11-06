import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { HttpError } from './lib/errors.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import { publicCatalog } from './services/catalog.js';
import { mediaManifest } from './services/media.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "connect-src 'self'",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    });
    next();
  });

  app.use('/api/admin', express.json({ limit: '60mb' }), adminRoutes);
  app.use('/api', express.json({ limit: '20kb' }), publicRoutes);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found', 'Ruta no encontrada.')));

  // Página pública: el catálogo va embebido en el HTML para pintar sin esperar otra solicitud.
  const indexFile = path.join(config.publicDir, 'index.html');
  const sendIndex = (_req, res) => {
    const html = fs.readFileSync(indexFile, 'utf8');
    const data = { ...publicCatalog(), media: mediaManifest() };
    const seo = data.site?.seo || {};
    const boot = JSON.stringify(data).replace(/</g, '\\u003c');
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(html
      .replace('<!--TITLE-->', esc(seo.title || data.site?.centerName || ''))
      .replace('<!--DESCRIPTION-->', esc(seo.description || ''))
      .replace('<!--BOOT-->', `<script id="boot" type="application/json">${boot}</script>`));
  };
  app.get(['/', '/index.html'], sendIndex);

  app.get(['/admin', '/admin/'], (_req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.sendFile(path.join(config.publicDir, 'admin', 'index.html'));
  });

  app.use(express.static(config.publicDir, {
    index: false,
    setHeaders(res, file) {
      if (/[\\/]media[\\/]/.test(file)) res.set('Cache-Control', 'public, max-age=86400');
      else res.set('Cache-Control', 'no-cache');
    },
  }));

  app.use((req, _res, next) => next(new HttpError(404, 'not_found', 'Página no encontrada.')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'Contenido demasiado grande.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'Formato inválido.' });
    if (!req.path.startsWith('/api') && status === 404) return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>No encontrado</title><p style="font-family:sans-serif;padding:2rem">Página no encontrada. <a href="/">Volver al inicio</a></p>');
    res.status(status).json({
      error: err.code || 'error',
      message: status >= 500 ? 'Ocurrió un error en el servidor. Probá de nuevo.' : err.message,
      ...(err.extra || {}),
    });
  });

  return app;
}
