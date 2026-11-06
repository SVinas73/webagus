// Inventario de archivos multimedia presentes en public/media.
// La web muestra el archivo si existe y, si no, el marcador [FOTO: …] / [VIDEO: …].
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';

const ALLOWED = new Set(['.webp', '.jpg', '.jpeg', '.png', '.avif', '.svg', '.mp4', '.webm']);
let cache = null;
let cacheAt = 0;

export function mediaManifest() {
  if (cache && Date.now() - cacheAt < 5000) return cache;
  const out = [];
  const walk = (dir, rel = '') => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (ALLOWED.has(path.extname(e.name).toLowerCase())) out.push(r);
    }
  };
  walk(config.mediaDir);
  cache = out.sort();
  cacheAt = Date.now();
  return cache;
}

export function invalidateMedia() { cache = null; }

/** Guarda un archivo subido desde el panel (base64). Solo nombres seguros y tipos permitidos. */
export function saveUpload(filename, base64) {
  const name = String(filename || '').toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  const ext = path.extname(name);
  if (!name || name.startsWith('.') || !ALLOWED.has(ext)) throw new HttpError(400, 'bad_file', 'Tipo de archivo no permitido.');
  const buf = Buffer.from(String(base64 || '').replace(/^data:[^,]+,/, ''), 'base64');
  if (!buf.length) throw new HttpError(400, 'empty', 'Archivo vacío.');
  if (buf.length > 40 * 1024 * 1024) throw new HttpError(413, 'too_large', 'El archivo supera 40 MB.');
  if (ext === '.svg' && /<script|on\w+\s*=|javascript:/i.test(buf.toString('utf8'))) {
    throw new HttpError(400, 'unsafe_svg', 'El SVG contiene código ejecutable.');
  }
  fs.mkdirSync(config.mediaDir, { recursive: true });
  fs.writeFileSync(path.join(config.mediaDir, name), buf);
  invalidateMedia();
  return name;
}

export function deleteMedia(filename) {
  const name = path.basename(String(filename || ''));
  const full = path.join(config.mediaDir, name);
  if (!name || !fs.existsSync(full)) throw new HttpError(404, 'not_found', 'Archivo no encontrado.');
  fs.unlinkSync(full);
  invalidateMedia();
}
