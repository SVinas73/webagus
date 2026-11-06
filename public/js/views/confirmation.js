// Confirmación. Solo se muestra con una reserva que el servidor confirmó haber guardado
// (se obtiene con el token devuelto por POST /api/bookings).
import { esc, plain, money, durationLabel, dateFull, waLink, icon } from '../lib/dom.js';
import { site, bookingCfg } from '../lib/data.js';
import { api } from '../lib/api.js';
import { home } from '../router.js';

const flowEl = () => document.getElementById('flow');

function icsFile(b) {
  const f = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const s = site();
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Centro//Reservas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${b.code}@reservas`, `DTSTAMP:${f(Date.now())}`, `DTSTART:${f(b.startUtc)}`, `DTEND:${f(b.endUtc)}`,
    `SUMMARY:${b.serviceName} · ${plain(s.centerName)}`.replace(/[,;]/g, ' '),
    `LOCATION:${[s.contact?.addressDetail, s.contact?.addressTitle].filter(Boolean).join(' - ').replace(/[,;]/g, ' ')}`,
    `DESCRIPTION:Código de reserva ${b.code}`, 'END:VEVENT', 'END:VCALENDAR',
  ];
  return URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
}

function googleCal(b) {
  const f = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const s = site();
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: `${b.serviceName} · ${plain(s.centerName)}`, dates: `${f(b.startUtc)}/${f(b.endUtc)}`,
    details: `Código de reserva: ${b.code}`, location: [s.contact?.addressDetail, s.contact?.addressTitle].filter(Boolean).join(', '),
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

function view(b, notifications) {
  const pending = b.status === 'pending';
  const cfg = bookingCfg();
  const s = site();
  const msg = `Hola, hice la reserva ${b.code}: ${b.serviceName}, ${dateFull(b.date)} a las ${b.time} h.`;
  return `
    <div class="done">
      <div class="card">
        <div class="check${pending ? ' pending' : ''}">${pending ? icon.hourglass : icon.check}</div>
        <h1 id="flowTitle" tabindex="-1">${pending ? 'Solicitud recibida' : 'Reserva confirmada'}</h1>
        <p class="lead">${pending
          ? `Gracias, ${esc(b.firstName)}. Tu horario quedó apartado y el centro va a confirmarlo.`
          : `Gracias, ${esc(b.firstName)}. Te esperamos.`}</p>
        <div class="code" aria-label="Código de reserva ${esc(b.code.split('').join(' '))}">${esc(b.code)}</div>
        <ul class="summary">
          <li><span>Tratamiento</span><b>${esc(b.serviceName)}</b></li>
          <li><span>Fecha</span><b>${esc(dateFull(b.date))}</b></li>
          <li><span>Hora</span><b>${esc(b.time)} h</b></li>
          <li><span>Duración</span><b>${esc(durationLabel(b.duration))}</b></li>
          <li><span>Precio</span><b>${esc(money(b.price) || 'A confirmar en consulta')}</b></li>
          ${b.staffName ? `<li><span>Profesional</span><b>${esc(b.staffName)}</b></li>` : ''}
          <li><span>Estado</span><b>${pending ? 'Pendiente de confirmación' : 'Confirmada'}</b></li>
        </ul>
        <div class="info">
          ${notifications?.clientEmail === 'sent' ? `<p>Te enviamos los detalles a <b>${esc(b.email)}</b>.</p>` : '<p>Guardá tu código de reserva: lo vas a necesitar si querés hacer cambios.</p>'}
          ${cfg.depositText ? `<p>${esc(cfg.depositText)}</p>` : ''}
          ${cfg.successNote ? `<p>${esc(cfg.successNote)}</p>` : ''}
        </div>
        <div class="actions">
          <a class="btn btn-primary" id="icsBtn" download="reserva-${esc(b.code)}.ics" href="#">Agregar a mi calendario</a>
          <a class="btn btn-ghost" href="${esc(googleCal(b))}" target="_blank" rel="noopener">Google Calendar</a>
          ${s.contact?.whatsapp ? `<a class="btn btn-ghost" href="${esc(waLink(s.contact.whatsapp, msg))}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ''}
          <button class="btn" type="button" id="homeBtn" style="color:var(--texto-2)">Volver al inicio</button>
        </div>
      </div>
    </div>`;
}

export async function renderConfirmation(token) {
  const el = flowEl();
  el.dataset.svc = '';
  let data = null;
  try { data = JSON.parse(sessionStorage.getItem(`reserva.ok.${token}`) || 'null'); } catch { data = null; }
  if (!data) {
    el.innerHTML = '<div class="done"><div class="state"><span class="spinner dark"></span>Cargando tu reserva…</div></div>';
    try { data = await api(`/api/bookings/${encodeURIComponent(token)}`); } catch (e) {
      el.innerHTML = `<div class="done"><div class="card"><h1 id="flowTitle" tabindex="-1">No encontramos la reserva</h1>
        <p class="lead">${esc(e.message)}</p><div class="actions"><button class="btn btn-primary" type="button" id="homeBtn">Volver al inicio</button></div></div></div>`;
      el.querySelector('#homeBtn').onclick = home;
      return;
    }
  }
  el.innerHTML = view(data.booking, data.notifications);
  el.scrollTop = 0;
  const ics = el.querySelector('#icsBtn');
  ics.href = icsFile(data.booking);
  el.querySelector('#homeBtn').onclick = home;
  requestAnimationFrame(() => el.querySelector('#flowTitle')?.focus({ preventScroll: true }));
}
