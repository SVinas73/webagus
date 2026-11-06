import { Router } from 'express';
import { rateLimit } from '../auth.js';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { publicCatalog } from '../services/catalog.js';
import { monthAvailability, slotsForDate } from '../services/availability.js';
import { createBooking, getBookingByToken, getBookingToken, publicSummary } from '../services/bookings.js';
import { notifyBookingCreated } from '../services/notifications.js';
import { mediaManifest } from '../services/media.js';

const r = Router();

r.get('/catalog', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json({ ...publicCatalog(), media: mediaManifest() });
});

r.get('/availability', (req, res) => {
  const { service, month, staff = 'any' } = req.query;
  const out = monthAvailability(String(service || ''), String(month || ''), String(staff));
  if (!out) throw new HttpError(400, 'bad_request', 'Parámetros inválidos.');
  res.set('Cache-Control', 'no-store');
  res.json(out);
});

r.get('/slots', (req, res) => {
  const { service, date, staff = 'any' } = req.query;
  const slots = slotsForDate(String(service || ''), String(date || ''), String(staff));
  if (!slots) throw new HttpError(400, 'bad_request', 'Parámetros inválidos.');
  res.set('Cache-Control', 'no-store');
  res.json({ date, slots: slots.map((s) => ({ time: s.time, staff: s.staff })) });
});

const bookingLimiter = rateLimit({ windowMs: 15 * 60_000, max: config.bookingRateLimit, message: 'Recibimos demasiadas reservas desde tu conexión. Esperá unos minutos o escribinos por WhatsApp.' });

r.post('/bookings', bookingLimiter, async (req, res) => {
  const body = req.body || {};
  // Campo trampa para bots: un humano nunca lo completa.
  if (body.website) throw new HttpError(400, 'rejected', 'No se pudo procesar la reserva.');
  const { booking, duplicate } = createBooking(body);
  const notifications = duplicate ? null : await notifyBookingCreated(booking);
  res.status(duplicate ? 200 : 201).json({
    booking: publicSummary(booking),
    token: getBookingToken(booking.id),
    notifications: notifications && { clientEmail: notifications.clientEmail },
  });
});

r.get('/bookings/:token', (req, res) => {
  const b = getBookingByToken(req.params.token);
  if (!b) throw new HttpError(404, 'not_found', 'No encontramos esa reserva.');
  res.set('Cache-Control', 'no-store');
  res.json({ booking: publicSummary(b) });
});

export default r;
