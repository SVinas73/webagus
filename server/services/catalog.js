// Lectura del catálogo (categorías, servicios, equipo) y de la configuración.
import { getDb } from '../db.js';

export function getSetting(key, d = getDb()) {
  const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}

export function setSetting(key, value, d = getDb()) {
  d.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

export function mapService(r) {
  return {
    id: r.id,
    category: r.category_id,
    name: r.name,
    subtitle: r.subtitle,
    duration: r.duration_min,
    price: r.price,
    description: r.description,
    ideal: r.ideal,
    steps: JSON.parse(r.steps || '[]'),
    note: r.note,
    photo: r.photo,
    slotStep: r.slot_step_min,
    buffer: r.buffer_min,
    sort: r.sort,
    active: !!r.active,
  };
}

export function mapCategory(r) {
  return { id: r.id, title: r.title, label: r.label, cta: r.cta, photo: r.photo, sort: r.sort, active: !!r.active };
}

export function mapStaff(r) {
  return {
    id: r.id, name: r.name, role: r.role, bio: r.bio, photo: r.photo,
    featured: !!r.featured, bookable: !!r.bookable, sort: r.sort, active: !!r.active,
  };
}

export function listCategories({ all = false } = {}, d = getDb()) {
  const rows = d.prepare(`SELECT * FROM categories ${all ? '' : 'WHERE active = 1'} ORDER BY sort, id`).all();
  return rows.map(mapCategory);
}

export function listServices({ all = false } = {}, d = getDb()) {
  const rows = d.prepare(`SELECT s.* FROM services s JOIN categories c ON c.id = s.category_id
    ${all ? '' : 'WHERE s.active = 1 AND c.active = 1'} ORDER BY c.sort, s.sort, s.id`).all();
  return rows.map(mapService);
}

export function getService(id, d = getDb()) {
  const r = d.prepare('SELECT * FROM services WHERE id = ?').get(id);
  return r ? mapService(r) : null;
}

export function listStaff({ all = false } = {}, d = getDb()) {
  const rows = d.prepare(`SELECT * FROM staff ${all ? '' : 'WHERE active = 1'} ORDER BY sort, id`).all();
  return rows.map(mapStaff);
}

export function serviceStaffMap(d = getDb()) {
  const map = {};
  for (const r of d.prepare('SELECT service_id, staff_id FROM service_staff').all()) {
    (map[r.service_id] ||= []).push(r.staff_id);
  }
  return map;
}

/** Profesionales activas y reservables que hacen un servicio, en orden. */
export function staffForService(serviceId, d = getDb()) {
  return d.prepare(`SELECT p.* FROM staff p JOIN service_staff ss ON ss.staff_id = p.id
    WHERE ss.service_id = ? AND p.active = 1 AND p.bookable = 1 ORDER BY p.sort, p.id`).all(serviceId).map(mapStaff);
}

/** Datos públicos para la web (no incluye nada sensible). */
export function publicCatalog(d = getDb()) {
  const site = getSetting('site', d);
  const booking = getSetting('booking', d);
  const services = listServices({}, d);
  const ssm = serviceStaffMap(d);
  const staff = listStaff({}, d);
  const bookableIds = new Set(staff.filter((p) => p.bookable).map((p) => p.id));
  return {
    site,
    booking: {
      depositText: booking.depositText,
      anyStaffLabel: booking.anyStaffLabel,
      successNote: booking.successNote,
      maxAdvanceDays: booking.maxAdvanceDays,
    },
    timezone: 'America/Montevideo',
    categories: listCategories({}, d),
    services: services.map((s) => ({
      ...s,
      staff: (ssm[s.id] || []).filter((id) => bookableIds.has(id)),
      slotStep: undefined, buffer: undefined, sort: undefined, active: undefined,
    })),
    staff: staff.map((p) => ({ id: p.id, name: p.name, role: p.role, bio: p.bio, photo: p.photo, featured: p.featured, bookable: p.bookable })),
  };
}
