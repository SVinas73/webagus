// Creación y gestión de reservas. La verificación definitiva de disponibilidad
// se hace aquí, dentro de una transacción BEGIN IMMEDIATE: SQLite serializa las
// escrituras, así que dos solicitudes simultáneas para el mismo horario nunca
// pueden confirmarse ambas. Un índice único parcial es la segunda barrera.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDb, tx } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { localToUtc, todayLocal, isValidDate, isValidTime } from '../lib/time.js';
import { validateClient } from '../lib/validation.js';
import { computeSlots, loadContext, rulesFrom } from './availability.js';
import { getService, getSetting, staffForService } from './catalog.js';

const TZ = config.timezone;
export const STATUSES = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
const ACTIVE = new Set(['pending', 'confirmed']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(d) {
  for (let i = 0; i < 10; i++) {
    const bytes = crypto.randomBytes(6);
    const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (!d.prepare('SELECT 1 FROM bookings WHERE code = ?').get(code)) return code;
  }
  throw new Error('No se pudo generar un código único');
}

export function mapBooking(r) {
  if (!r) return null;
  return {
    id: r.id, code: r.code, serviceId: r.service_id, serviceName: r.service_name, categoryId: r.category_id,
    staffId: r.staff_id, staffName: r.staff_name, date: r.local_date, time: r.local_time,
    startUtc: r.start_utc, endUtc: r.end_utc, duration: r.duration_min, price: r.price,
    client: { fullName: r.client_name, birthDate: r.client_birth, phone: r.client_phone, email: r.client_email, notes: r.client_notes },
    status: r.status, source: r.source, adminNotes: r.admin_notes,
    history: JSON.parse(r.history || '[]'), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/** Resumen público (pantalla de confirmación). No expone datos de contacto completos. */
export function publicSummary(b) {
  return {
    code: b.code, serviceId: b.serviceId, serviceName: b.serviceName, staffName: b.staffName, date: b.date, time: b.time,
    startUtc: b.startUtc, endUtc: b.endUtc, duration: b.duration, price: b.price, status: b.status, firstName: b.client.fullName.split(' ')[0],
    email: b.client.email.replace(/^(.).*(@.*)$/, '$1•••$2'),
  };
}

/** Elige profesional entre las libres: la que menos turnos tiene ese día (reparte la carga). */
function pickStaff(d, candidates, date) {
  if (candidates.length <= 1) return candidates[0] ?? '';
  const counts = new Map(candidates.map((id) => [id, 0]));
  const rows = d.prepare(`SELECT staff_id, COUNT(*) n FROM bookings WHERE local_date = ? AND status IN ('pending','confirmed') GROUP BY staff_id`).all(date);
  for (const r of rows) if (counts.has(r.staff_id)) counts.set(r.staff_id, r.n);
  return [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

function assertSlotFree({ d, service, date, time, staffId, excludeId = null, now, enforceRules = true }) {
  let staffList = staffForService(service.id, d);
  if (staffId && staffId !== 'any') {
    staffList = staffList.filter((p) => p.id === staffId);
    if (!staffList.length) throw new HttpError(409, 'staff_unavailable', 'La profesional elegida no realiza este servicio.');
  }
  const ctx = loadContext(d, date, date);
  if (excludeId) ctx.bookings = ctx.bookings.filter((b) => b.id !== excludeId);
  const rules = enforceRules ? rulesFrom(d) : { minNoticeHours: -24 * 365, maxAdvanceDays: 3650 };
  const slots = computeSlots({ service, staffList, date, ctx, rules, now });
  const slot = slots.find((s) => s.time === time);
  if (!slot) throw new HttpError(409, 'slot_taken', 'Ese horario ya no está disponible. Elegí otro, por favor.');
  return { slot, staffList };
}

export function createBooking(input, { d = getDb(), now = Date.now(), source = 'web', status, enforceRules = true } = {}) {
  const { serviceId, date, time, staffId = 'any', requestId } = input;
  if (!isValidDate(date || '') || !isValidTime(time || '')) throw new HttpError(400, 'invalid_slot', 'Fecha u hora inválida.');
  const service = getService(serviceId, d);
  if (!service || !service.active) throw new HttpError(404, 'service_not_found', 'El servicio no existe.');

  const v = validateClient(input, todayLocal(TZ, now));
  if (!v.ok) throw new HttpError(422, 'validation', 'Revisá los datos del formulario.', { fields: v.errors });

  const rid = typeof requestId === 'string' && /^[\w-]{8,64}$/.test(requestId) ? requestId : null;

  return tx(d, () => {
    if (rid) {
      const prev = d.prepare('SELECT * FROM bookings WHERE request_id = ?').get(rid);
      if (prev) return { booking: mapBooking(prev), duplicate: true };
    }
    const { slot, staffList } = assertSlotFree({ d, service, date, time, staffId, now, enforceRules });
    const chosen = pickStaff(d, slot.staff, date);
    const staffName = staffList.find((p) => p.id === chosen)?.name || '';
    const startUtc = localToUtc(date, time, TZ);
    const endUtc = startUtc + service.duration * 60_000;
    const bookingSettings = getSetting('booking', d) || {};
    const finalStatus = status || (bookingSettings.defaultStatus === 'pending' ? 'pending' : 'confirmed');
    const ts = Date.now();
    const history = [{ at: ts, action: 'created', by: source, status: finalStatus }];
    const info = d.prepare(`INSERT INTO bookings(code, token, request_id, service_id, service_name, category_id, staff_id, staff_name,
        start_utc, end_utc, local_date, local_time, duration_min, buffer_min, price,
        client_name, client_birth, client_phone, client_email, client_notes, status, source, history, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      newCode(d), crypto.randomBytes(24).toString('base64url'), rid, service.id, service.name, service.category, chosen, staffName,
      startUtc, endUtc, date, time, service.duration, service.buffer || 0, service.price ?? null,
      v.value.fullName, v.value.birthDate, v.value.phone, v.value.email, v.value.notes, finalStatus, source,
      JSON.stringify(history), ts, ts,
    );
    const row = d.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(info.lastInsertRowid));
    return { booking: mapBooking(row), duplicate: false };
  });
}

export function getBookingByToken(token, d = getDb()) {
  if (typeof token !== 'string' || token.length < 20) return null;
  return mapBooking(d.prepare('SELECT * FROM bookings WHERE token = ?').get(token));
}

export function getBookingToken(id, d = getDb()) {
  return d.prepare('SELECT token FROM bookings WHERE id = ?').get(id)?.token;
}

export function getBooking(id, d = getDb()) {
  return mapBooking(d.prepare('SELECT * FROM bookings WHERE id = ?').get(id));
}

export function listBookings({ from, to, status, q, limit = 500 } = {}, d = getDb()) {
  const where = [];
  const args = [];
  if (from && isValidDate(from)) { where.push('local_date >= ?'); args.push(from); }
  if (to && isValidDate(to)) { where.push('local_date <= ?'); args.push(to); }
  if (status && STATUSES.includes(status)) { where.push('status = ?'); args.push(status); }
  if (q) {
    where.push('(client_name LIKE ? OR client_email LIKE ? OR client_phone LIKE ? OR code LIKE ?)');
    const like = `%${String(q).slice(0, 60)}%`;
    args.push(like, like, like, like);
  }
  const sql = `SELECT * FROM bookings ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY local_date, local_time LIMIT ${Math.min(Number(limit) || 500, 2000)}`;
  return d.prepare(sql).all(...args).map(mapBooking);
}

function pushHistory(row, entry) {
  const h = JSON.parse(row.history || '[]');
  h.push({ at: Date.now(), ...entry });
  return JSON.stringify(h);
}

export function updateStatus(id, status, { by = 'admin', reason = '' } = {}, d = getDb()) {
  if (!STATUSES.includes(status)) throw new HttpError(400, 'invalid_status', 'Estado inválido.');
  return tx(d, () => {
    const row = d.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'not_found', 'Reserva no encontrada.');
    // Reactivar una reserva cancelada exige que el horario siga libre.
    if (!ACTIVE.has(row.status) && ACTIVE.has(status)) {
      const service = getService(row.service_id, d) || { id: row.service_id, duration: row.duration_min, buffer: row.buffer_min, active: true };
      assertSlotFree({ d, service, date: row.local_date, time: row.local_time, staffId: row.staff_id || 'any', excludeId: id, now: Date.now(), enforceRules: false });
    }
    d.prepare('UPDATE bookings SET status = ?, history = ?, updated_at = ? WHERE id = ?')
      .run(status, pushHistory(row, { action: 'status', from: row.status, status, by, reason }), Date.now(), id);
    return getBooking(id, d);
  });
}

export function reschedule(id, { date, time, staffId }, { by = 'admin' } = {}, d = getDb()) {
  if (!isValidDate(date || '') || !isValidTime(time || '')) throw new HttpError(400, 'invalid_slot', 'Fecha u hora inválida.');
  return tx(d, () => {
    const row = d.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'not_found', 'Reserva no encontrada.');
    if (!ACTIVE.has(row.status)) throw new HttpError(409, 'inactive', 'Solo se pueden reprogramar reservas activas.');
    const service = getService(row.service_id, d);
    if (!service) throw new HttpError(409, 'service_missing', 'El servicio de esta reserva ya no existe.');
    const wanted = staffId || row.staff_id || 'any';
    const { slot, staffList } = assertSlotFree({ d, service, date, time, staffId: wanted, excludeId: id, now: Date.now(), enforceRules: false });
    const chosen = slot.staff.includes(row.staff_id) ? row.staff_id : pickStaff(d, slot.staff, date);
    const startUtc = localToUtc(date, time, TZ);
    d.prepare(`UPDATE bookings SET local_date=?, local_time=?, start_utc=?, end_utc=?, staff_id=?, staff_name=?, duration_min=?, history=?, updated_at=? WHERE id=?`).run(
      date, time, startUtc, startUtc + service.duration * 60_000, chosen, staffList.find((p) => p.id === chosen)?.name || '',
      service.duration, pushHistory(row, { action: 'rescheduled', from: `${row.local_date} ${row.local_time}`, to: `${date} ${time}`, by }), Date.now(), id,
    );
    return getBooking(id, d);
  });
}

export function updateAdminNotes(id, notes, d = getDb()) {
  const r = d.prepare('UPDATE bookings SET admin_notes = ?, updated_at = ? WHERE id = ?').run(String(notes || '').slice(0, 2000), Date.now(), id);
  if (!r.changes) throw new HttpError(404, 'not_found', 'Reserva no encontrada.');
  return getBooking(id, d);
}
