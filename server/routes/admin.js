import { Router } from 'express';
import { config } from '../config.js';
import { getDb, tx } from '../db.js';
import { checkPassword, clearSession, isAuthenticated, issueSession, rateLimit, requireAdmin } from '../auth.js';
import { HttpError } from '../lib/errors.js';
import { isValidDate, isValidTime, todayLocal } from '../lib/time.js';
import { RESERVED_IDS, slugify } from '../lib/validation.js';
import {
  getSetting, setSetting, listCategories, listServices, listStaff, serviceStaffMap, getService, staffForService,
} from '../services/catalog.js';
import { computeSlots, loadContext } from '../services/availability.js';
import {
  createBooking, listBookings, updateStatus, reschedule, updateAdminNotes, getBooking,
} from '../services/bookings.js';
import { notificationsStatus, notifyBookingChanged } from '../services/notifications.js';
import { mediaManifest, saveUpload, deleteMedia } from '../services/media.js';

const r = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 8, message: 'Demasiados intentos. Esperá 15 minutos.' });

r.post('/login', loginLimiter, (req, res) => {
  if (!config.adminPassword) throw new HttpError(503, 'not_configured', 'El panel no está habilitado: falta definir ADMIN_PASSWORD en el servidor.');
  if (!checkPassword(req.body?.password || '')) throw new HttpError(401, 'bad_password', 'Contraseña incorrecta.');
  issueSession(res);
  res.json({ ok: true });
});

r.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

r.get('/me', (req, res) => res.json({ authenticated: isAuthenticated(req), configured: !!config.adminPassword }));

r.use(requireAdmin);

const db = () => getDb();
const str = (v, max = 4000) => String(v ?? '').trim().slice(0, max);
const int = (v, { min = 0, max = 100000, nullable = false } = {}) => {
  if (nullable && (v === null || v === '' || v === undefined)) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, 'invalid_number', `Valor numérico inválido (${min}–${max}).`);
  return n;
};
function newId(table, wanted, fallback) {
  const base = slugify(wanted) || fallback;
  if (RESERVED_IDS.has(base)) throw new HttpError(400, 'reserved', 'Ese identificador está reservado.');
  let id = base; let i = 2;
  while (db().prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) id = `${base}-${i++}`;
  return id;
}

// ---------- Resumen ----------
r.get('/overview', (_req, res) => {
  const today = todayLocal(config.timezone);
  const d = db();
  const count = (sql, ...a) => d.prepare(sql).get(...a).n;
  res.json({
    today,
    todayCount: count(`SELECT COUNT(*) n FROM bookings WHERE local_date = ? AND status IN ('pending','confirmed')`, today),
    upcomingCount: count(`SELECT COUNT(*) n FROM bookings WHERE local_date >= ? AND status IN ('pending','confirmed')`, today),
    pendingCount: count(`SELECT COUNT(*) n FROM bookings WHERE local_date >= ? AND status = 'pending'`, today),
    notifications: notificationsStatus(),
    publicUrl: config.publicUrl,
  });
});

// ---------- Configuración ----------
const SETTING_KEYS = new Set(['site', 'booking']);
r.get('/settings', (_req, res) => res.json({ site: getSetting('site'), booking: getSetting('booking') }));
r.put('/settings/:key', (req, res) => {
  const { key } = req.params;
  if (!SETTING_KEYS.has(key)) throw new HttpError(404, 'not_found', 'Clave desconocida.');
  const v = req.body;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'invalid', 'Formato inválido.');
  if (key === 'booking') {
    v.minNoticeHours = int(v.minNoticeHours, { min: 0, max: 24 * 30 });
    v.maxAdvanceDays = int(v.maxAdvanceDays, { min: 1, max: 365 });
    if (!['confirmed', 'pending'].includes(v.defaultStatus)) throw new HttpError(400, 'invalid', 'Estado por defecto inválido.');
  }
  if (JSON.stringify(v).length > 200_000) throw new HttpError(413, 'too_large', 'Contenido demasiado grande.');
  setSetting(key, v);
  res.json(getSetting(key));
});

// ---------- Categorías ----------
r.get('/categories', (_req, res) => res.json(listCategories({ all: true })));
function catFields(b) {
  const title = str(b.title, 120);
  if (!title) throw new HttpError(400, 'invalid', 'El título es obligatorio.');
  return { title, label: str(b.label, 120) || `Reservar ${title.replace(/_/g, '')}`, cta: str(b.cta, 120), photo: str(b.photo, 200), active: b.active === false ? 0 : 1 };
}
r.post('/categories', (req, res) => {
  const f = catFields(req.body || {});
  const id = newId('categories', req.body?.id || f.title.replace(/_/g, ''), 'categoria');
  const sort = db().prepare('SELECT COALESCE(MAX(sort), -1) + 1 s FROM categories').get().s;
  db().prepare('INSERT INTO categories(id,title,label,cta,photo,sort,active) VALUES (?,?,?,?,?,?,?)').run(id, f.title, f.label, f.cta, f.photo, sort, f.active);
  res.status(201).json(listCategories({ all: true }).find((c) => c.id === id));
});
r.put('/categories/:id', (req, res) => {
  const f = catFields(req.body || {});
  const x = db().prepare('UPDATE categories SET title=?, label=?, cta=?, photo=?, active=? WHERE id=?').run(f.title, f.label, f.cta, f.photo, f.active, req.params.id);
  if (!x.changes) throw new HttpError(404, 'not_found', 'Categoría no encontrada.');
  res.json(listCategories({ all: true }).find((c) => c.id === req.params.id));
});
r.delete('/categories/:id', (req, res) => {
  const n = db().prepare('SELECT COUNT(*) n FROM services WHERE category_id = ?').get(req.params.id).n;
  if (n) throw new HttpError(409, 'in_use', 'La categoría tiene tratamientos. Movelos o eliminalos primero (o desactivá la categoría).');
  db().prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
r.post('/reorder/:table', (req, res) => {
  const table = { categories: 'categories', services: 'services', staff: 'staff' }[req.params.table];
  if (!table || !Array.isArray(req.body?.ids)) throw new HttpError(400, 'invalid', 'Orden inválido.');
  tx(db(), () => req.body.ids.forEach((id, i) => db().prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`).run(i, String(id))));
  res.json({ ok: true });
});

// ---------- Tratamientos ----------
r.get('/services', (_req, res) => {
  const m = serviceStaffMap();
  res.json(listServices({ all: true }).map((s) => ({ ...s, staff: m[s.id] || [] })));
});
function svcFields(b) {
  const name = str(b.name, 160);
  if (!name) throw new HttpError(400, 'invalid', 'El nombre es obligatorio.');
  const cat = str(b.category, 60);
  if (!db().prepare('SELECT 1 FROM categories WHERE id = ?').get(cat)) throw new HttpError(400, 'invalid', 'Categoría inexistente.');
  const steps = Array.isArray(b.steps) ? b.steps.map((s) => str(s, 200)).filter(Boolean).slice(0, 30) : [];
  return {
    category: cat, name, subtitle: str(b.subtitle, 160), duration: int(b.duration, { min: 5, max: 600 }),
    price: int(b.price, { min: 0, max: 10_000_000, nullable: true }), description: str(b.description, 4000),
    ideal: str(b.ideal, 400), steps: JSON.stringify(steps), note: str(b.note, 600), photo: str(b.photo, 200),
    slotStep: int(b.slotStep, { min: 5, max: 600, nullable: true }), buffer: int(b.buffer ?? 0, { min: 0, max: 240 }),
    active: b.active === false ? 0 : 1, staff: Array.isArray(b.staff) ? b.staff.map(String) : [],
  };
}
function saveSvcStaff(id, staff) {
  db().prepare('DELETE FROM service_staff WHERE service_id = ?').run(id);
  const ins = db().prepare('INSERT OR IGNORE INTO service_staff(service_id, staff_id) SELECT ?, id FROM staff WHERE id = ?');
  for (const s of staff) ins.run(id, s);
}
r.post('/services', (req, res) => {
  const f = svcFields(req.body || {});
  const id = newId('services', req.body?.id || f.name, 'tratamiento');
  tx(db(), () => {
    const sort = db().prepare('SELECT COALESCE(MAX(sort), -1) + 1 s FROM services WHERE category_id = ?').get(f.category).s;
    db().prepare(`INSERT INTO services(id,category_id,name,subtitle,duration_min,price,description,ideal,steps,note,photo,slot_step_min,buffer_min,sort,active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, f.category, f.name, f.subtitle, f.duration, f.price, f.description, f.ideal, f.steps, f.note, f.photo, f.slotStep, f.buffer, sort, f.active);
    saveSvcStaff(id, f.staff);
  });
  res.status(201).json({ ...getService(id), staff: f.staff });
});
r.put('/services/:id', (req, res) => {
  const f = svcFields(req.body || {});
  const id = req.params.id;
  tx(db(), () => {
    const x = db().prepare(`UPDATE services SET category_id=?, name=?, subtitle=?, duration_min=?, price=?, description=?, ideal=?, steps=?, note=?, photo=?, slot_step_min=?, buffer_min=?, active=? WHERE id=?`)
      .run(f.category, f.name, f.subtitle, f.duration, f.price, f.description, f.ideal, f.steps, f.note, f.photo, f.slotStep, f.buffer, f.active, id);
    if (!x.changes) throw new HttpError(404, 'not_found', 'Tratamiento no encontrado.');
    saveSvcStaff(id, f.staff);
  });
  res.json({ ...getService(id), staff: f.staff });
});
r.delete('/services/:id', (req, res) => {
  db().prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Equipo ----------
r.get('/staff', (_req, res) => res.json(listStaff({ all: true })));
function staffFields(b) {
  const name = str(b.name, 100);
  if (!name) throw new HttpError(400, 'invalid', 'El nombre es obligatorio.');
  return { name, role: str(b.role, 120), bio: str(b.bio, 400), photo: str(b.photo, 200), featured: b.featured ? 1 : 0, bookable: b.bookable === false ? 0 : 1, active: b.active === false ? 0 : 1 };
}
r.post('/staff', (req, res) => {
  const f = staffFields(req.body || {});
  const id = newId('staff', req.body?.id || f.name, 'profesional');
  const sort = db().prepare('SELECT COALESCE(MAX(sort), -1) + 1 s FROM staff').get().s;
  db().prepare('INSERT INTO staff(id,name,role,bio,photo,featured,bookable,sort,active) VALUES (?,?,?,?,?,?,?,?,?)').run(id, f.name, f.role, f.bio, f.photo, f.featured, f.bookable, sort, f.active);
  res.status(201).json(listStaff({ all: true }).find((p) => p.id === id));
});
r.put('/staff/:id', (req, res) => {
  const f = staffFields(req.body || {});
  const x = db().prepare('UPDATE staff SET name=?, role=?, bio=?, photo=?, featured=?, bookable=?, active=? WHERE id=?').run(f.name, f.role, f.bio, f.photo, f.featured, f.bookable, f.active, req.params.id);
  if (!x.changes) throw new HttpError(404, 'not_found', 'Profesional no encontrada.');
  res.json(listStaff({ all: true }).find((p) => p.id === req.params.id));
});
r.delete('/staff/:id', (req, res) => {
  const n = db().prepare(`SELECT COUNT(*) n FROM bookings WHERE staff_id = ? AND status IN ('pending','confirmed') AND local_date >= ?`).get(req.params.id, todayLocal(config.timezone)).n;
  if (n) throw new HttpError(409, 'in_use', `Tiene ${n} reserva(s) futuras. Reprogramalas o desactivá la profesional.`);
  db().prepare('DELETE FROM staff WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Horarios ----------
r.get('/hours', (_req, res) => res.json(db().prepare('SELECT id, staff_id AS staff, weekday, start, end FROM hours ORDER BY staff_id, weekday, start').all()));
r.put('/hours', (req, res) => {
  const staff = req.body?.staff || null;
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) throw new HttpError(400, 'invalid', 'Formato inválido.');
  if (staff && !db().prepare('SELECT 1 FROM staff WHERE id = ?').get(staff)) throw new HttpError(400, 'invalid', 'Profesional inexistente.');
  for (const h of rows) {
    if (!Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6 || !isValidTime(h.start) || !isValidTime(h.end) || h.start >= h.end) {
      throw new HttpError(400, 'invalid', 'Revisá los horarios: la hora de cierre debe ser posterior a la de apertura.');
    }
  }
  tx(db(), () => {
    if (staff) db().prepare('DELETE FROM hours WHERE staff_id = ?').run(staff);
    else db().prepare('DELETE FROM hours WHERE staff_id IS NULL').run();
    const ins = db().prepare('INSERT INTO hours(staff_id, weekday, start, end) VALUES (?,?,?,?)');
    for (const h of rows) ins.run(staff, h.weekday, h.start, h.end);
  });
  res.json({ ok: true });
});

// ---------- Bloqueos ----------
r.get('/blocks', (_req, res) => res.json(db().prepare('SELECT id, staff_id AS staff, date_from AS "from", date_to AS "to", start, end, reason FROM blocks ORDER BY date_from').all()));
r.post('/blocks', (req, res) => {
  const b = req.body || {};
  const from = str(b.from, 10); const to = str(b.to, 10) || from;
  if (!isValidDate(from) || !isValidDate(to) || to < from) throw new HttpError(400, 'invalid', 'Fechas inválidas.');
  const partial = b.start || b.end;
  if (partial && (!isValidTime(b.start) || !isValidTime(b.end) || b.start >= b.end)) throw new HttpError(400, 'invalid', 'Franja horaria inválida.');
  const staff = b.staff || null;
  if (staff && !db().prepare('SELECT 1 FROM staff WHERE id = ?').get(staff)) throw new HttpError(400, 'invalid', 'Profesional inexistente.');
  const info = db().prepare('INSERT INTO blocks(staff_id,date_from,date_to,start,end,reason) VALUES (?,?,?,?,?,?)').run(staff, from, to, partial ? b.start : null, partial ? b.end : null, str(b.reason, 200));
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});
r.delete('/blocks/:id', (req, res) => {
  db().prepare('DELETE FROM blocks WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Reservas ----------
r.get('/bookings', (req, res) => res.json(listBookings(req.query)));
r.get('/bookings/:id', (req, res) => {
  const b = getBooking(Number(req.params.id));
  if (!b) throw new HttpError(404, 'not_found', 'Reserva no encontrada.');
  res.json(b);
});
r.post('/bookings', (req, res) => {
  // Carga manual desde el panel (turnos por WhatsApp o teléfono). No aplica antelación mínima.
  const { booking } = createBooking(req.body || {}, { source: 'admin', status: req.body?.status === 'pending' ? 'pending' : 'confirmed', enforceRules: false });
  res.status(201).json(booking);
});
r.patch('/bookings/:id/status', async (req, res) => {
  const b = updateStatus(Number(req.params.id), req.body?.status, { reason: str(req.body?.reason, 300) });
  await notifyBookingChanged(b, 'status');
  res.json(b);
});
r.patch('/bookings/:id/reschedule', async (req, res) => {
  const b = reschedule(Number(req.params.id), req.body || {});
  await notifyBookingChanged(b, 'rescheduled');
  res.json(b);
});
r.patch('/bookings/:id/notes', (req, res) => res.json(updateAdminNotes(Number(req.params.id), req.body?.notes)));

/** Horarios libres para carga manual / reprogramación (sin antelación mínima). */
r.get('/slots', (req, res) => {
  const { service, date, staff = 'any', exclude } = req.query;
  const svc = getService(String(service || ''));
  if (!svc || !isValidDate(String(date || ''))) throw new HttpError(400, 'bad_request', 'Parámetros inválidos.');
  let staffList = staffForService(svc.id);
  if (staff !== 'any') staffList = staffList.filter((p) => p.id === staff);
  const ctx = loadContext(db(), date, date);
  if (exclude) ctx.bookings = ctx.bookings.filter((b) => b.id !== Number(exclude));
  const slots = computeSlots({ service: svc, staffList, date, ctx, rules: { minNoticeHours: -24 * 365, maxAdvanceDays: 3650 } });
  res.json({ slots });
});

// ---------- Multimedia ----------
r.get('/media', (_req, res) => res.json(mediaManifest()));
r.post('/media', (req, res) => res.status(201).json({ file: saveUpload(req.body?.filename, req.body?.data) }));
r.delete('/media/:name', (req, res) => { deleteMedia(req.params.name); res.json({ ok: true }); });

export default r;
