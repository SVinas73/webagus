import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  label     TEXT NOT NULL,
  cta       TEXT NOT NULL DEFAULT '',
  photo     TEXT NOT NULL DEFAULT '',
  sort      INTEGER NOT NULL DEFAULT 0,
  active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS services (
  id            TEXT PRIMARY KEY,
  category_id   TEXT NOT NULL REFERENCES categories(id) ON UPDATE CASCADE,
  name          TEXT NOT NULL,
  subtitle      TEXT NOT NULL DEFAULT '',
  duration_min  INTEGER NOT NULL,
  price         INTEGER,
  description   TEXT NOT NULL DEFAULT '',
  ideal         TEXT NOT NULL DEFAULT '',
  steps         TEXT NOT NULL DEFAULT '[]',
  note          TEXT NOT NULL DEFAULT '',
  photo         TEXT NOT NULL DEFAULT '',
  slot_step_min INTEGER,
  buffer_min    INTEGER NOT NULL DEFAULT 0,
  sort          INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS staff (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL DEFAULT '',
  bio       TEXT NOT NULL DEFAULT '',
  photo     TEXT NOT NULL DEFAULT '',
  featured  INTEGER NOT NULL DEFAULT 0,
  bookable  INTEGER NOT NULL DEFAULT 1,
  sort      INTEGER NOT NULL DEFAULT 0,
  active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS service_staff (
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE ON UPDATE CASCADE,
  staff_id   TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (service_id, staff_id)
);

-- Horarios de atención. staff_id NULL = horario general del centro.
-- Si una profesional tiene filas propias, se usan las suyas en lugar del general.
CREATE TABLE IF NOT EXISTS hours (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id  TEXT REFERENCES staff(id) ON DELETE CASCADE,
  weekday   INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start     TEXT NOT NULL,
  end       TEXT NOT NULL
);

-- Bloqueos: días no laborables, feriados, vacaciones o franjas puntuales.
-- staff_id NULL = afecta a todo el centro. start/end NULL = día completo.
CREATE TABLE IF NOT EXISTS blocks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id   TEXT REFERENCES staff(id) ON DELETE CASCADE,
  date_from  TEXT NOT NULL,
  date_to    TEXT NOT NULL,
  start      TEXT,
  end        TEXT,
  reason     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bookings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  token         TEXT NOT NULL UNIQUE,
  request_id    TEXT UNIQUE,
  service_id    TEXT NOT NULL,
  service_name  TEXT NOT NULL,
  category_id   TEXT NOT NULL,
  staff_id      TEXT NOT NULL DEFAULT '',
  staff_name    TEXT NOT NULL DEFAULT '',
  start_utc     INTEGER NOT NULL,
  end_utc       INTEGER NOT NULL,
  local_date    TEXT NOT NULL,
  local_time    TEXT NOT NULL,
  duration_min  INTEGER NOT NULL,
  buffer_min    INTEGER NOT NULL DEFAULT 0,
  price         INTEGER,
  client_name   TEXT NOT NULL,
  client_birth  TEXT NOT NULL DEFAULT '',
  client_phone  TEXT NOT NULL,
  client_email  TEXT NOT NULL,
  client_notes  TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),
  source        TEXT NOT NULL DEFAULT 'web',
  admin_notes   TEXT NOT NULL DEFAULT '',
  history       TEXT NOT NULL DEFAULT '[]',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(local_date);
CREATE INDEX IF NOT EXISTS idx_bookings_staff_time ON bookings(staff_id, start_utc);
-- Defensa extra: nunca dos reservas activas con la misma profesional y el mismo inicio.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_active_slot
  ON bookings(staff_id, start_utc) WHERE status IN ('pending','confirmed');
`;

let db;

export function openDb(file = config.dbFile) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec(SCHEMA);
  return d;
}

export function getDb() {
  if (!db) {
    db = openDb();
    if (isCatalogEmpty(db)) seed(db, readSeed());
  }
  return db;
}

/** Permite inyectar una base (tests). */
export function setDb(d) { db = d; }

export function readSeed(file = config.seedFile) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isCatalogEmpty(d) {
  return d.prepare('SELECT COUNT(*) AS n FROM categories').get().n === 0;
}

/** Ejecuta fn dentro de una transacción con bloqueo de escritura inmediato. */
export function tx(d, fn) {
  d.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    d.exec('COMMIT');
    return r;
  } catch (e) {
    try { d.exec('ROLLBACK'); } catch { /* ya revertida */ }
    throw e;
  }
}

/** Carga el contenido de demostración. Con reset=true borra el catálogo (no las reservas). */
export function seed(d, data, { reset = false } = {}) {
  tx(d, () => {
    if (reset) {
      for (const t of ['service_staff', 'hours', 'blocks', 'services', 'categories', 'staff', 'settings']) {
        d.exec(`DELETE FROM ${t}`);
      }
    }
    const setS = d.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(data.settings)) setS.run(k, JSON.stringify(v));

    const insC = d.prepare('INSERT INTO categories(id,title,label,cta,photo,sort,active) VALUES (?,?,?,?,?,?,1)');
    data.categories.forEach((c, i) => insC.run(c.id, c.title, c.label, c.cta || '', c.photo || '', i));

    const insS = d.prepare(`INSERT INTO services(id,category_id,name,subtitle,duration_min,price,description,ideal,steps,note,photo,slot_step_min,buffer_min,sort,active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
    data.services.forEach((s, i) => insS.run(
      s.id, s.category, s.name, s.subtitle || '', s.duration, s.price ?? null,
      s.description || '', s.ideal || '', JSON.stringify(s.steps || []), s.note || '',
      s.photo || '', s.slotStep ?? null, s.buffer || 0, i,
    ));

    const insP = d.prepare('INSERT INTO staff(id,name,role,bio,photo,featured,bookable,sort,active) VALUES (?,?,?,?,?,?,?,?,1)');
    const insSS = d.prepare('INSERT INTO service_staff(service_id, staff_id) VALUES (?,?)');
    data.staff.forEach((p, i) => {
      insP.run(p.id, p.name, p.role || '', p.bio || '', p.photo || '', p.featured ? 1 : 0, p.bookable === false ? 0 : 1, i);
      const svcs = p.services === '*' ? data.services.map((s) => s.id) : data.services.filter((s) => (p.categories || []).includes(s.category)).map((s) => s.id);
      for (const sid of svcs) insSS.run(sid, p.id);
    });

    const insH = d.prepare('INSERT INTO hours(staff_id, weekday, start, end) VALUES (?,?,?,?)');
    for (const h of data.hours) insH.run(h.staff || null, h.weekday, h.start, h.end);

    const insB = d.prepare('INSERT INTO blocks(staff_id,date_from,date_to,start,end,reason) VALUES (?,?,?,?,?,?)');
    for (const b of data.blocks || []) insB.run(b.staff || null, b.from, b.to || b.from, b.start || null, b.end || null, b.reason || '');
  });
}
