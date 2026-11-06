// Notificaciones reales. Nada se simula: si una integración no está configurada,
// el resultado es 'disabled' y la interfaz no afirma que se haya enviado nada.
//
// - Email (SMTP): confirmación a la clienta + aviso al centro.
// - Webhook: POST JSON firmado (HMAC-SHA256) para automatizaciones externas
//   (por ejemplo WhatsApp vía Make, Zapier, n8n o la API de WhatsApp Business).
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { getSetting } from './catalog.js';

let transport;
function mailer() {
  const s = config.smtp;
  if (!s.host || !s.from) return null;
  transport ||= nodemailer.createTransport({
    host: s.host, port: s.port, secure: s.secure,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
  });
  return transport;
}

export function notificationsStatus() {
  return {
    email: !!mailer(),
    businessEmail: !!(mailer() && config.smtp.notifyTo),
    webhook: !!config.webhookUrl,
  };
}

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function formatDateEs(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

function money(p) { return p == null ? 'A confirmar' : `$ ${p.toLocaleString('es-UY')}`; }

function bookingLines(b) {
  return [
    ['Servicio', b.serviceName],
    ['Fecha', formatDateEs(b.date)],
    ['Hora', `${b.time} h (hora de Montevideo)`],
    ['Duración', `${b.duration} minutos`],
    ['Precio', money(b.price)],
    ...(b.staffName ? [['Profesional', b.staffName]] : []),
    ['Código', b.code],
  ];
}

function htmlMail(title, intro, rows, footer) {
  return `<!doctype html><html><body style="margin:0;background:#F3EFE5;font-family:Arial,sans-serif;color:#2C3027">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <div style="background:#FCFCF9;border:1px solid #E5E2D8;border-radius:16px;padding:28px">
  <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:0 0 12px">${esc(title)}</h1>
  <p style="margin:0 0 20px;line-height:1.6;color:#2C3027">${esc(intro)}</p>
  <table style="width:100%;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-top:1px solid #E5E2D8;color:#77786D;font-size:13px">${esc(k)}</td><td style="padding:8px 0;border-top:1px solid #E5E2D8;text-align:right">${esc(v)}</td></tr>`).join('')}</table>
  ${footer ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#77786D">${esc(footer)}</p>` : ''}
  </div></div></body></html>`;
}

async function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })]).finally(() => clearTimeout(t));
}

export async function notifyBookingCreated(b) {
  const result = { clientEmail: 'disabled', businessEmail: 'disabled', webhook: 'disabled' };
  const site = getSetting('site') || {};
  const booking = getSetting('booking') || {};
  const center = site.centerName || 'Centro';
  const t = mailer();
  const jobs = [];

  if (t) {
    const statusText = b.status === 'pending' ? 'Tu solicitud de reserva quedó registrada y está pendiente de confirmación.' : 'Tu reserva está confirmada.';
    jobs.push(withTimeout(t.sendMail({
      from: config.smtp.from, to: b.client.email,
      subject: `${b.status === 'pending' ? 'Reserva recibida' : 'Reserva confirmada'} · ${center}`,
      html: htmlMail(`Hola ${b.client.fullName.split(' ')[0]}`, statusText, bookingLines(b), [booking.depositText, booking.successNote].filter(Boolean).join(' · ')),
      text: `${statusText}\n\n${bookingLines(b).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${booking.successNote || ''}`,
    }), 9000).then(() => { result.clientEmail = 'sent'; }, (e) => { result.clientEmail = 'failed'; console.error('[mail cliente]', e.message); }));

    if (config.smtp.notifyTo) {
      jobs.push(withTimeout(t.sendMail({
        from: config.smtp.from, to: config.smtp.notifyTo, replyTo: b.client.email,
        subject: `Nueva reserva: ${b.serviceName} · ${b.date} ${b.time}`,
        html: htmlMail('Nueva reserva', `${b.client.fullName} · ${b.client.phone} · ${b.client.email}`, [...bookingLines(b), ['Estado', b.status], ['Notas', b.client.notes || '—']]),
      }), 9000).then(() => { result.businessEmail = 'sent'; }, (e) => { result.businessEmail = 'failed'; console.error('[mail centro]', e.message); }));
    }
  }

  if (config.webhookUrl) {
    const body = JSON.stringify({ event: 'booking.created', booking: b });
    const headers = { 'content-type': 'application/json' };
    if (config.webhookSecret) headers['x-signature'] = crypto.createHmac('sha256', config.webhookSecret).update(body).digest('hex');
    jobs.push(withTimeout(fetch(config.webhookUrl, { method: 'POST', headers, body }), 8000)
      .then((r) => { result.webhook = r.ok ? 'sent' : 'failed'; }, (e) => { result.webhook = 'failed'; console.error('[webhook]', e.message); }));
  }

  await Promise.all(jobs);
  return result;
}

export async function notifyBookingChanged(b, action) {
  if (!config.webhookUrl) return;
  const body = JSON.stringify({ event: `booking.${action}`, booking: b });
  const headers = { 'content-type': 'application/json' };
  if (config.webhookSecret) headers['x-signature'] = crypto.createHmac('sha256', config.webhookSecret).update(body).digest('hex');
  try { await withTimeout(fetch(config.webhookUrl, { method: 'POST', headers, body }), 8000); } catch (e) { console.error('[webhook]', e.message); }
}
