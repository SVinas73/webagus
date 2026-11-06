// Pruebas del sistema de reservas: disponibilidad, conflictos, validación, API y panel.
// Usan una base SQLite temporal; nunca tocan data/centro.db.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reservas-test-'));
process.env.DATA_DIR = tmp;
process.env.DB_FILE = path.join(tmp, 'test.db');
process.env.ADMIN_PASSWORD = 'clave-de-prueba-solo-tests';
process.env.SMTP_HOST = '';
process.env.BOOKING_WEBHOOK_URL = '';
process.env.BOOKING_RATE_LIMIT = '1000';

const { getDb } = await import('../server/db.js');
const { createApp } = await import('../server/app.js');
const { computeSlots, slotsForDate, monthAvailability } = await import('../server/services/availability.js');
const { createBooking } = await import('../server/services/bookings.js');
const { localToUtc, todayLocal, addDays, weekdayOf } = await import('../server/lib/time.js');
const { normalizePhone, validateClient } = await import('../server/lib/validation.js');

const TZ = 'America/Montevideo';
let server; let base;

/** Próxima fecha (desde mañana+1) que cae en el día de semana pedido. */
function nextWeekday(wd) {
  let d = addDays(todayLocal(TZ), 2);
  while (weekdayOf(d) !== wd) d = addDays(d, 1);
  return d;
}
const client = { fullName: 'Clienta Test', birthDate: '1990-01-15', phone: '099 111 222', email: 'test@example.com' };

before(async () => {
  const d = getDb();
  // El contenido demo tiene una sola cosmetóloga. Para probar la lógica con varias profesionales
  // se agrega una segunda con horario propio (martes 13–19 y miércoles 09–19).
  d.prepare("INSERT INTO staff(id,name,role,sort,active,bookable) VALUES ('prof-test','Prof Test','Cosmetóloga',9,1,1)").run();
  for (const s of ['masaje-facial', 'limpieza-profunda', 'facial-antioxidante']) d.prepare('INSERT INTO service_staff(service_id, staff_id) VALUES (?,?)').run(s, 'prof-test');
  d.prepare("INSERT INTO hours(staff_id,weekday,start,end) VALUES ('prof-test',2,'13:00','19:00'),('prof-test',3,'09:00','19:00')").run();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); });

test('zona horaria: 10:00 en Montevideo = 13:00 UTC', () => {
  assert.equal(new Date(localToUtc('2026-11-10', '10:00', TZ)).toISOString(), '2026-11-10T13:00:00.000Z');
});

test('normaliza teléfonos uruguayos', () => {
  assert.equal(normalizePhone('099 123 456'), '+59899123456');
  assert.equal(normalizePhone('+54 9 11 5555 4444'), '+5491155554444');
});

test('validación de datos de la clienta', () => {
  const v = validateClient({ fullName: '', birthDate: '2999-01-01', phone: '12', email: 'x@' }, '2026-11-05');
  assert.equal(v.ok, false);
  assert.deepEqual(Object.keys(v.errors).sort(), ['birthDate', 'email', 'fullName', 'phone']);
  assert.equal(validateClient(client, '2026-11-05').ok, true);
});

test('domingo cerrado: sin horarios', () => {
  assert.deepEqual(slotsForDate('limpieza-profunda', nextWeekday(0)), []);
});

test('horarios respetan apertura, cierre y duración', () => {
  const slots = slotsForDate('limpieza-profunda', nextWeekday(1)); // lunes 09–19, 75 min
  assert.equal(slots[0].time, '09:00');
  const last = slots[slots.length - 1].time;
  const [h, m] = last.split(':').map(Number);
  assert.ok(h * 60 + m + 75 <= 19 * 60, `el último turno (${last}) debe terminar antes del cierre`);
});

test('profesional con horario propio solo aparece en su franja', () => {
  const tue = nextWeekday(2);
  const slots = slotsForDate('limpieza-profunda', tue, 'prof-test');
  assert.ok(slots.length > 0);
  assert.ok(slots.every((s) => s.time >= '13:00'));
  assert.deepEqual(slotsForDate('limpieza-profunda', nextWeekday(1), 'prof-test'), []); // lunes no trabaja
});

test('antelación mínima: no ofrece turnos demasiado próximos', () => {
  const svc = { id: 'x', duration: 60, slotStep: null, buffer: 0 };
  const ctx = { hours: [{ staff_id: null, weekday: weekdayOf('2026-11-10'), start: '09:00', end: '18:00' }], blocks: [], bookings: [] };
  const now = localToUtc('2026-11-10', '08:00', TZ);
  const slots = computeSlots({ service: svc, staffList: [], date: '2026-11-10', ctx, rules: { minNoticeHours: 3, maxAdvanceDays: 60 }, now });
  assert.equal(slots[0].time, '11:00');
});

test('reserva ocupa el horario y la profesional; "cualquiera" asigna a otra libre', () => {
  const day = nextWeekday(3);
  const r1 = createBooking({ serviceId: 'masaje-facial', date: day, time: '10:00', staffId: 'cosmetologa', ...client });
  assert.equal(r1.booking.staffId, 'cosmetologa');
  const free = slotsForDate('masaje-facial', day).find((s) => s.time === '10:00');
  assert.deepEqual(free.staff, ['prof-test']);
  const r2 = createBooking({ serviceId: 'masaje-facial', date: day, time: '10:00', staffId: 'any', ...client });
  assert.equal(r2.booking.staffId, 'prof-test');
  assert.throws(() => createBooking({ serviceId: 'masaje-facial', date: day, time: '10:00', ...client }), { code: 'slot_taken' });
});

test('evita superposiciones parciales (turnos de distinta duración)', () => {
  const day = nextWeekday(4);
  createBooking({ serviceId: 'limpieza-profunda', date: day, time: '09:00', staffId: 'cosmetologa', ...client }); // 09:00–10:15
  const a = slotsForDate('facial-antioxidante', day, 'cosmetologa').map((s) => s.time); // 60 min
  assert.ok(!a.includes('09:00'));
  assert.ok(a.every((t) => t >= '10:15' || t < '09:00'));
});

test('bloqueo de día completo y de franja', () => {
  const d = getDb();
  const day = nextWeekday(5);
  d.prepare('INSERT INTO blocks(staff_id,date_from,date_to,start,end,reason) VALUES (NULL,?,?,NULL,NULL,?)').run(day, day, 'test');
  assert.deepEqual(slotsForDate('limpieza-profunda', day), []);
  const day2 = addDays(day, 7);
  d.prepare('INSERT INTO blocks(staff_id,date_from,date_to,start,end,reason) VALUES (NULL,?,?,?,?,?)').run(day2, day2, '12:00', '15:00', 'test');
  const times = slotsForDate('masaje-facial', day2).map((s) => s.time);
  assert.ok(times.every((t) => t <= '11:00' || t >= '15:00'), times.join(','));
  assert.ok(!times.includes('12:00') && !times.includes('14:00'));
});

test('disponibilidad mensual marca solo días con turnos', () => {
  const month = addDays(todayLocal(TZ), 20).slice(0, 7);
  const r = monthAvailability('limpieza-profunda', month);
  for (const d of Object.keys(r.days)) assert.notEqual(weekdayOf(d), 0);
});

test('API: 20 solicitudes simultáneas por el mismo horario → solo 1 se confirma', async () => {
  const tue = addDays(nextWeekday(2), 14);
  const req = (i) => fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serviceId: 'masaje-facial', date: tue, time: '16:00', staffId: 'cosmetologa', ...client, email: `c${i}@example.com` }) });
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) => req(i)));
  const codes = res.map((r) => r.status);
  assert.equal(codes.filter((c) => c === 201).length, 1, codes.join(','));
  assert.equal(codes.filter((c) => c === 409).length, 19);
});

test('API: reintento con el mismo requestId no duplica la reserva', async () => {
  const day = nextWeekday(6);
  const b = JSON.stringify({ serviceId: 'masaje-facial', date: day, time: '11:00', requestId: 'req-abc-123456', ...client });
  const r1 = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b });
  const r2 = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b });
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 200);
  assert.equal((await r1.json()).booking.code, (await r2.json()).booking.code);
});

test('API: confirmación no promete mail si SMTP no está configurado', async () => {
  const day = addDays(nextWeekday(1), 21);
  const r = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serviceId: 'masaje-facial', date: day, time: '12:00', ...client }) });
  const j = await r.json();
  assert.equal(r.status, 201);
  assert.equal(j.notifications.clientEmail, 'disabled');
  const g = await fetch(`${base}/api/bookings/${j.token}`);
  assert.equal((await g.json()).booking.code, j.booking.code);
});

test('API: validación devuelve errores por campo', async () => {
  const r = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serviceId: 'masaje-facial', date: nextWeekday(1), time: '09:00' }) });
  assert.equal(r.status, 422);
  const j = await r.json();
  assert.ok(j.fields.fullName && j.fields.email && j.fields.phone && j.fields.birthDate);
});

test('panel: rechaza sin sesión, con contraseña incorrecta y sin encabezado CSRF', async () => {
  assert.equal((await fetch(`${base}/api/admin/bookings`)).status, 401);
  const bad = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"no"}' });
  assert.equal(bad.status, 401);
  const ok = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/i);
  assert.equal((await fetch(`${base}/api/admin/bookings`, { headers: { cookie } })).status, 200);
  const noCsrf = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noCsrf.status, 403);
  // Cancelar libera el horario
  const list = await (await fetch(`${base}/api/admin/bookings`, { headers: { cookie } })).json();
  const b = list.find((x) => x.status === 'confirmed');
  const c = await fetch(`${base}/api/admin/bookings/${b.id}/status`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json', 'x-requested-with': 'fetch' }, body: '{"status":"cancelled"}' });
  assert.equal((await c.json()).status, 'cancelled');
  const free = slotsForDate(b.serviceId, b.date, b.staffId).map((s) => s.time);
  assert.ok(free.includes(b.time));
});

test('página pública incluye el catálogo y no expone datos del panel', async () => {
  const html = await (await fetch(base)).text();
  assert.match(html, /<script id="boot" type="application\/json">/);
  assert.doesNotMatch(html, /ADMIN_PASSWORD|client_email|minNoticeHours/);
});
