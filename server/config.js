import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carga .env si existe (Node >= 21.7 trae process.loadEnvFile).
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

const env = process.env;
const DATA_DIR = path.resolve(ROOT, env.DATA_DIR || 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

/** Secreto de sesión: variable de entorno o archivo generado una sola vez en DATA_DIR. */
function sessionSecret() {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 32) return env.SESSION_SECRET;
  const f = path.join(DATA_DIR, '.session-secret');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}

export const config = {
  port: Number(env.PORT) || 3000,
  isProd: env.NODE_ENV === 'production',
  timezone: 'America/Montevideo',
  dataDir: DATA_DIR,
  dbFile: env.DB_FILE ? path.resolve(ROOT, env.DB_FILE) : path.join(DATA_DIR, 'centro.db'),
  publicDir: path.join(ROOT, 'public'),
  mediaDir: path.join(ROOT, 'public', 'media'),
  seedFile: path.join(ROOT, 'data', 'seed.json'),
  adminPassword: env.ADMIN_PASSWORD || '',
  sessionSecret: sessionSecret(),
  publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || '',
    notifyTo: env.MAIL_NOTIFY_TO || '',
  },
  bookingRateLimit: Number(env.BOOKING_RATE_LIMIT) || 20, // reservas por IP cada 15 minutos
  webhookUrl: env.BOOKING_WEBHOOK_URL || '',
  webhookSecret: env.BOOKING_WEBHOOK_SECRET || '',
};
