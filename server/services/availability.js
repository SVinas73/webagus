// Cálculo de disponibilidad real a partir de horarios, bloqueos y reservas guardadas.
import { config } from '../config.js';
import { getDb } from '../db.js';
import {
  localToUtc, todayLocal, addDays, weekdayOf, daysInMonth, toMinutes, fromMinutes, isValidDate,
} from '../lib/time.js';
import { getSetting, getService, staffForService } from './catalog.js';

const TZ = config.timezone;
const ACTIVE = "('pending','confirmed')";

function loadContext(d, dateFrom, dateTo) {
  const hours = d.prepare('SELECT staff_id, weekday, start, end FROM hours').all();
  const blocks = d.prepare('SELECT staff_id, date_from, date_to, start, end FROM blocks WHERE date_to >= ? AND date_from <= ?').all(dateFrom, dateTo);
  // Margen de un día a cada lado para cubrir reservas que crucen la medianoche UTC.
  const fromUtc = localToUtc(addDays(dateFrom, -1), '00:00', TZ);
  const toUtc = localToUtc(addDays(dateTo, 2), '00:00', TZ);
  const bookings = d.prepare(`SELECT id, staff_id, start_utc, end_utc, buffer_min FROM bookings
    WHERE status IN ${ACTIVE} AND end_utc > ? AND start_utc < ?`).all(fromUtc, toUtc);
  return { hours, blocks, bookings };
}

function hoursFor(ctx, staffId, weekday) {
  const own = ctx.hours.filter((h) => h.staff_id === staffId);
  const src = own.length ? own : ctx.hours.filter((h) => h.staff_id === null);
  return src.filter((h) => h.weekday === weekday).map((h) => [toMinutes(h.start), toMinutes(h.end)]);
}

function blocksFor(ctx, staffId, date) {
  return ctx.blocks.filter((b) => (b.staff_id === null || b.staff_id === staffId) && b.date_from <= date && b.date_to >= date);
}

/**
 * Horarios libres de un servicio en una fecha local.
 * Devuelve [{ time: 'HH:MM', staff: [ids libres en ese horario] }].
 */
export function computeSlots({ service, staffList, date, ctx, rules, now = Date.now() }) {
  const today = todayLocal(TZ, now);
  if (date < today || date > addDays(today, rules.maxAdvanceDays)) return [];
  const weekday = weekdayOf(date);
  const duration = service.duration;
  const step = service.slotStep || duration;
  const buffer = service.buffer || 0;
  const earliest = now + rules.minNoticeHours * 3600_000;
  const resources = staffList.length ? staffList.map((p) => p.id) : [''];
  const bySlot = new Map();

  for (const staffId of resources) {
    const dayBlocks = blocksFor(ctx, staffId || null, date);
    if (dayBlocks.some((b) => !b.start)) continue; // bloqueado todo el día
    const partial = dayBlocks.map((b) => [toMinutes(b.start), toMinutes(b.end)]);
    const busy = ctx.bookings.filter((b) => b.staff_id === staffId);

    for (const [open, close] of hoursFor(ctx, staffId || null, weekday)) {
      for (let m = open; m + duration <= close; m += step) {
        const end = m + duration;
        if (partial.some(([bs, be]) => m < be && end > bs)) continue;
        const startUtc = localToUtc(date, fromMinutes(m), TZ);
        if (startUtc < earliest) continue;
        const endUtc = startUtc + (duration + buffer) * 60_000;
        const clash = busy.some((b) => startUtc < b.end_utc + b.buffer_min * 60_000 && endUtc > b.start_utc);
        if (clash) continue;
        const t = fromMinutes(m);
        if (!bySlot.has(t)) bySlot.set(t, []);
        bySlot.get(t).push(staffId);
      }
    }
  }
  return [...bySlot.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, staff]) => ({ time, staff }));
}

function rulesFrom(d) {
  const b = getSetting('booking', d) || {};
  return { minNoticeHours: Number(b.minNoticeHours) || 0, maxAdvanceDays: Number(b.maxAdvanceDays) || 60 };
}

function resolve(serviceId, staffId, d) {
  const service = getService(serviceId, d);
  if (!service || !service.active) return null;
  let staffList = staffForService(serviceId, d);
  if (staffId && staffId !== 'any') staffList = staffList.filter((p) => p.id === staffId);
  return { service, staffList };
}

export function slotsForDate(serviceId, date, staffId = 'any', d = getDb(), now = Date.now()) {
  if (!isValidDate(date)) return null;
  const r = resolve(serviceId, staffId, d);
  if (!r) return null;
  if (staffId !== 'any' && !r.staffList.length) return [];
  const ctx = loadContext(d, date, date);
  return computeSlots({ ...r, date, ctx, rules: rulesFrom(d), now });
}

/** Días con al menos un horario libre en un mes ('YYYY-MM'). */
export function monthAvailability(serviceId, month, staffId = 'any', d = getDb(), now = Date.now()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const r = resolve(serviceId, staffId, d);
  if (!r) return null;
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
  const ctx = loadContext(d, first, last);
  const rules = rulesFrom(d);
  const days = {};
  if (staffId !== 'any' && !r.staffList.length) return { month, days };
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const n = computeSlots({ ...r, date, ctx, rules, now }).length;
    if (n) days[date] = n;
  }
  return { month, today: todayLocal(TZ, now), days };
}

export { loadContext, rulesFrom };
