// Flujo de reserva propio. Reproduce la secuencia del widget de la referencia:
//   1) calendario con días disponibles (y selector de profesional)
//   2) horarios del día → al tocar uno aparece "Seleccionar"
//   3) datos: Nombre completo, Fecha de nacimiento, Teléfono, Mail, Info adicional
//   4) confirmación (solo si el servidor guardó la reserva)
// La disponibilidad siempre viene del servidor y se vuelve a verificar al guardar.
import { esc, plain, money, durationLabel, durationShort, dateLong, monthLabel, icon, isDesktop } from '../lib/dom.js';
import { site, bookingCfg, category, service, staff, hasMedia } from '../lib/data.js';
import { media } from '../lib/media.js';
import { api, ApiError } from '../lib/api.js';
import { nav, back } from '../router.js';

const TZ = 'America/Montevideo';
const flowEl = () => document.getElementById('flow');
const FORM_KEY = 'reserva.form';
const st = {
  serviceId: null, staffId: 'any', month: null, today: null,
  avail: new Map(), slots: new Map(),
  pendingTime: null, notice: null, requestId: null, requestKey: null, submitting: false,
};

let form = {};
try { form = JSON.parse(sessionStorage.getItem(FORM_KEY) || '{}'); } catch { form = {}; }
const saveForm = () => { try { sessionStorage.setItem(FORM_KEY, JSON.stringify(form)); } catch { /* modo privado */ } };

function todayInTz() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const addDaysIso = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const hhmm = (t) => t.replace(':', '');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/* ---------------- Datos del servidor ---------------- */
async function loadMonth(ym) {
  const key = `${st.serviceId}|${st.staffId}|${ym}`;
  if (st.avail.has(key)) return st.avail.get(key);
  const r = await api(`/api/availability?service=${encodeURIComponent(st.serviceId)}&month=${ym}&staff=${encodeURIComponent(st.staffId)}`);
  st.today = r.today || st.today;
  st.avail.set(key, r.days || {});
  return r.days || {};
}
async function loadSlots(date, { fresh = false } = {}) {
  const key = `${st.serviceId}|${st.staffId}|${date}`;
  if (!fresh && st.slots.has(key)) return st.slots.get(key);
  const r = await api(`/api/slots?service=${encodeURIComponent(st.serviceId)}&date=${date}&staff=${encodeURIComponent(st.staffId)}`);
  st.slots.set(key, r.slots);
  return r.slots;
}
function invalidate() { st.avail.clear(); st.slots.clear(); }

/* ---------------- Estructura ---------------- */
function infoCard(s) {
  const c = category(s.category);
  const b = bookingCfg();
  const logo = hasMedia('logo-centro.svg') ? `<img src="/media/logo-centro.svg" alt="">` : media({ file: 'logo-centro.svg', label: 'Logo del centro', kind: 'logo', compact: true });
  return `
    <div class="fl-brand"><div class="fl-logo">${logo}</div>
      <div><div class="eyebrow">${esc(plain(c ? c.title : ''))}</div><div style="font-size:.9rem;color:var(--texto-2)">${esc(plain(site().centerName))}</div></div></div>
    <h1 id="flowTitle" tabindex="-1">${esc(s.name)}</h1>
    ${s.subtitle ? `<p class="sub">${esc(s.subtitle)}</p>` : ''}
    <ul class="facts">
      <li>${icon.clock}<span>${esc(durationShort(s.duration))}</span></li>
      <li>${icon.calendar}<span id="factWhen" class="muted">Elegí fecha y hora</span></li>
      <li id="factStaffLi" hidden>${icon.user}<span id="factStaff"></span></li>
      <li>${icon.globe}<span>America/Montevideo (GMT-3)</span></li>
      ${money(s.price) ? `<li>${icon.note}<span>Precio: <span class="hl">${esc(money(s.price))}</span></span></li>` : ''}
      ${b.depositText ? `<li>${icon.note}<span class="hl">${esc(b.depositText)}</span></li>` : ''}
    </ul>
    ${s.description ? `<div class="more" id="more"><p>${esc(s.description.replace(/\n+/g, ' '))}</p><button type="button" aria-expanded="false">Mostrar más</button></div>` : ''}`;
}

function shell(s) {
  const el = flowEl();
  el.dataset.svc = s.id;
  el.innerHTML = `
    <div class="fl-bar" aria-hidden="true"></div><button class="back" type="button" id="flBack">${icon.back}<span>Atrás</span></button>
    <div class="fl">
      <aside class="card fl-info">${infoCard(s)}</aside>
      <section class="card fl-step" id="flStep" aria-live="polite"></section>
    </div>`;
  const more = el.querySelector('#more');
  if (more) {
    const p = more.querySelector('p');
    const btn = more.querySelector('button');
    requestAnimationFrame(() => { if (p.scrollHeight <= p.clientHeight + 2) btn.hidden = true; });
    btn.addEventListener('click', () => {
      const open = more.classList.toggle('open');
      btn.textContent = open ? 'Mostrar menos' : 'Mostrar más';
      btn.setAttribute('aria-expanded', String(open));
    });
  }
}

function updateFacts(s, route) {
  const el = flowEl();
  const when = el.querySelector('#factWhen');
  if (route.date) {
    const d = dateLong(route.date);
    when.textContent = route.time ? `${d} · ${route.time} h` : d;
    when.className = 'hl';
    when.style.textTransform = 'none';
  } else { when.textContent = 'Elegí fecha y hora'; when.className = 'muted'; }
  const li = el.querySelector('#factStaffLi');
  const p = st.staffId !== 'any' ? staff(st.staffId) : null;
  li.hidden = !p;
  if (p) el.querySelector('#factStaff').textContent = `Con ${p.name}`;
}

/* ---------------- Paso 1: calendario ---------------- */
function staffSelector(s) {
  const opts = (s.staff || []).map((id) => staff(id)).filter(Boolean);
  if (opts.length < 2) return '';
  return `<div class="staff-sel"><label for="staffSel">Profesional</label>
    <select class="select" id="staffSel">
      <option value="any">${esc(bookingCfg().anyStaffLabel || 'Cualquier profesional disponible')}</option>
      ${opts.map((p) => `<option value="${esc(p.id)}"${st.staffId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
    </select></div>`;
}

function calendarHTML(days, selected) {
  const ym = st.month;
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // semana empieza el lunes, como la referencia
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = st.today || todayInTz();
  const maxMonth = addMonths(today.slice(0, 7), Math.ceil((bookingCfg().maxAdvanceDays || 60) / 30));
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span aria-hidden="true"></span>');
  for (let d = 1; d <= total; d++) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`;
    const av = !!days[iso];
    const cls = ['day', av && 'av', iso === selected && 'sel', iso === today && 'today'].filter(Boolean).join(' ');
    const label = `${dateLong(iso)}${av ? ', con horarios disponibles' : ', sin disponibilidad'}`;
    cells.push(av
      ? `<button type="button" class="${cls}" data-date="${iso}" aria-label="${esc(label)}"${iso === selected ? ' aria-pressed="true"' : ''}>${d}</button>`
      : `<span class="${cls}" aria-label="${esc(label)}">${d}</span>`);
  }
  const none = !Object.keys(days).length;
  return `
    <div class="cal-top">
      <h3 aria-live="polite">${esc(monthLabel(ym))}</h3>
      <div class="cal-nav">
        <button class="iconbtn" type="button" data-month="-1" aria-label="Mes anterior"${ym <= today.slice(0, 7) ? ' disabled' : ''}>${icon.left}</button>
        <button class="iconbtn" type="button" data-month="1" aria-label="Mes siguiente"${ym >= maxMonth ? ' disabled' : ''}>${icon.right}</button>
      </div>
    </div>
    <div class="cal" id="cal">
      <div class="cal-grid" role="grid" aria-label="${esc(`Calendario de ${monthLabel(ym)}`)}">
        ${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((w) => `<span class="cal-wd" aria-hidden="true">${w}</span>`).join('')}
        ${cells.join('')}
      </div>
      <div class="loader"><span class="spinner dark"></span></div>
    </div>
    ${none ? `<div class="slots-empty">No quedan turnos disponibles en ${esc(monthLabel(ym))}.${ym < maxMonth ? '<br><button class="btn btn-ghost" type="button" data-month="1">Ver mes siguiente</button>' : ''}</div>` : ''}
    <div class="cal-legend"><span><i></i>Con turnos</span><span><i class="x"></i>Sin disponibilidad</span></div>
    <div class="tz">${icon.globe}<span>Horarios en hora de Montevideo (GMT-3)</span></div>`;
}

function slotsHTML(date, slots, { withBack }) {
  const s = service(st.serviceId);
  const rows = slots.map((x) => {
    const sel = st.pendingTime === x.time;
    return `<div class="slot-row${sel ? ' sel' : ''}" data-time="${x.time}">
      <button type="button" class="slot" data-pick="${x.time}" aria-pressed="${sel}">${x.time}</button>
      <button type="button" class="slot-go" data-go="${x.time}" ${sel ? '' : 'tabindex="-1" aria-hidden="true"'}>Seleccionar</button>
    </div>`;
  }).join('');
  return `
    <div class="step-h slots-h">
      ${withBack ? `<button class="iconbtn" type="button" id="toCal" aria-label="Volver al calendario">${icon.left}</button>` : ''}
      <div><h2 class="date" tabindex="-1" id="slotsTitle">${esc(dateLong(date))}</h2><span class="dur">Duración: ${esc(durationLabel(s.duration))}</span></div>
    </div>
    ${st.notice ? `<div class="notice err" role="alert">${esc(st.notice)}</div>` : ''}
    ${slots.length
      ? `<p class="eyebrow" style="margin-top:.4rem">Elegí un horario</p><div class="slots" role="list">${rows}</div>`
      : `<div class="slots-empty">No quedan horarios para este día.<br><button class="btn btn-ghost" type="button" id="nextAvail">Ver próximo día disponible</button></div>`}`;
}

async function renderCalendarStep(s, route) {
  const step = flowEl().querySelector('#flStep');
  const desktop = isDesktop();
  if (!st.month) st.month = (route.date || st.today || todayInTz()).slice(0, 7);
  const showSlots = desktop && route.date;
  step.innerHTML = `
    <div class="step-h"><h2 tabindex="-1" id="calTitle">Elegí el día</h2></div>
    ${staffSelector(s)}
    <div class="cal-wrap${desktop ? ' with-slots' : ''}">
      <div id="calBox"><div class="state"><span class="spinner dark"></span>Buscando turnos disponibles…</div></div>
      ${desktop ? `<div id="slotBox">${showSlots ? '<div class="state"><span class="spinner dark"></span></div>' : '<div class="slots-hint">Elegí un día del calendario para ver los horarios.</div>'}</div>` : ''}
    </div>`;
  bindStaff(s, route);
  await paintCalendar(route.date);
  if (showSlots) await paintSlots(route.date, step.querySelector('#slotBox'), { withBack: false });
}

async function paintCalendar(selected) {
  const box = flowEl().querySelector('#calBox');
  if (!box) return;
  const cal = box.querySelector('#cal');
  if (cal) cal.classList.add('loading');
  let days;
  try { days = await loadMonth(st.month); } catch (e) { box.innerHTML = errorBox(e, 'retryCal'); box.querySelector('#retryCal').onclick = () => paintCalendar(selected); return; }
  // En el primer ingreso, si el mes actual ya no tiene turnos, saltar al siguiente con disponibilidad.
  if (!selected && !Object.keys(days).length && !st.autoJumped) {
    st.autoJumped = true;
    const next = addMonths(st.month, 1);
    try { const nd = await loadMonth(next); if (Object.keys(nd).length) { st.month = next; days = nd; } } catch { /* se queda en el mes actual */ }
  }
  box.innerHTML = calendarHTML(days, selected);
  box.querySelectorAll('[data-month]').forEach((b) => b.addEventListener('click', () => {
    st.month = addMonths(st.month, Number(b.dataset.month));
    paintCalendar(selected);
  }));
  box.querySelectorAll('[data-date]').forEach((b) => b.addEventListener('click', () => {
    st.pendingTime = null; st.notice = null;
    nav(`#/reservar/${st.serviceId}/${b.dataset.date}`, { replace: isDesktop() && !!selected });
  }));
}

async function paintSlots(date, box, { withBack }) {
  box.innerHTML = '<div class="state"><span class="spinner dark"></span>Buscando horarios…</div>';
  let slots;
  try { slots = await loadSlots(date, { fresh: !!st.notice }); } catch (e) { box.innerHTML = errorBox(e, 'retrySlots'); box.querySelector('#retrySlots').onclick = () => paintSlots(date, box, { withBack }); return; }
  box.innerHTML = slotsHTML(date, slots, { withBack });
  const back2cal = box.querySelector('#toCal');
  if (back2cal) back2cal.addEventListener('click', () => back(`#/reservar/${st.serviceId}`));
  box.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    st.pendingTime = st.pendingTime === b.dataset.pick ? null : b.dataset.pick;
    box.querySelectorAll('.slot-row').forEach((r) => {
      const on = r.dataset.time === st.pendingTime;
      r.classList.toggle('sel', on);
      r.querySelector('.slot').setAttribute('aria-pressed', String(on));
      const go = r.querySelector('.slot-go');
      if (on) { go.removeAttribute('tabindex'); go.removeAttribute('aria-hidden'); } else { go.setAttribute('tabindex', '-1'); go.setAttribute('aria-hidden', 'true'); }
    });
  }));
  box.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    st.notice = null;
    nav(`#/reservar/${st.serviceId}/${date}/${hhmm(b.dataset.go)}`);
  }));
  const na = box.querySelector('#nextAvail');
  if (na) na.addEventListener('click', () => goNextAvailable(date));
}

async function goNextAvailable(from) {
  let ym = from.slice(0, 7);
  for (let i = 0; i < 4; i++) {
    let days;
    try { days = await loadMonth(ym); } catch { return; }
    const next = Object.keys(days).sort().find((d) => d > from);
    if (next) { st.month = next.slice(0, 7); nav(`#/reservar/${st.serviceId}/${next}`, { replace: true }); return; }
    ym = addMonths(ym, 1);
  }
}

function bindStaff(s, route) {
  const sel = flowEl().querySelector('#staffSel');
  if (!sel) return;
  sel.addEventListener('change', () => {
    st.staffId = sel.value;
    st.pendingTime = null;
    updateFacts(s, route);
    if (route.date) nav(`#/reservar/${s.id}`, { replace: true });
    else paintCalendar(null);
  });
}

function errorBox(e, id) {
  return `<div class="slots-empty" role="alert">${esc(e.message || 'No pudimos cargar la información.')}<br><button class="btn btn-ghost" type="button" id="${id}">Reintentar</button></div>`;
}

/* ---------------- Paso 3: datos ---------------- */
const isoToMask = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
function maskToIso(v) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function field({ id, label, type = 'text', required = true, value = '', attrs = '', help = '', textarea = false }) {
  const input = textarea
    ? `<textarea class="input" id="${id}" name="${id}" ${attrs}>${esc(value)}</textarea>`
    : `<input class="input" id="${id}" name="${id}" type="${type}" value="${esc(value)}" ${required ? 'required aria-required="true"' : ''} ${attrs}>`;
  return `<div class="field" data-f="${id}">
    <label for="${id}">${esc(label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ' <span class="opt-l">(opcional)</span>'}</label>
    ${input}
    ${help ? `<p class="help" id="${id}-help">${esc(help)}</p>` : ''}
    <p class="err" id="${id}-err" role="alert"></p>
  </div>`;
}

function validate(v, today) {
  const e = {};
  if (!v.fullName.trim()) e.fullName = 'Nombre completo es obligatorio';
  else if (v.fullName.trim().length < 3) e.fullName = 'Ingresá tu nombre completo';
  if (!v.birthMask) e.birthDate = 'Fecha de nacimiento es obligatoria';
  else {
    const iso = maskToIso(v.birthMask);
    const dt = iso && new Date(`${iso}T12:00:00Z`);
    if (!iso || Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso || iso < '1900-01-01' || iso >= today) e.birthDate = 'Ingresá una fecha válida (DD/MM/AAAA)';
  }
  const digits = v.phone.replace(/\D/g, '');
  if (!digits) e.phone = 'Teléfono es obligatorio';
  else if (digits.length < 8 || digits.length > 15) e.phone = 'Ingresá un teléfono válido';
  if (!v.email.trim()) e.email = 'Mail es obligatorio';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = 'Ingresá un mail válido';
  if (v.notes.length > 1000) e.notes = 'Máximo 1000 caracteres';
  return e;
}

function showErrors(step, errors) {
  step.querySelectorAll('.field').forEach((f) => {
    const k = f.dataset.f === 'birthMask' ? 'birthDate' : f.dataset.f;
    const msg = errors[k];
    f.classList.toggle('bad', !!msg);
    f.querySelector('.err').textContent = msg || '';
    const input = f.querySelector('.input');
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    const desc = [msg ? `${f.dataset.f}-err` : '', f.querySelector('.help') ? `${f.dataset.f}-help` : ''].filter(Boolean).join(' ');
    if (desc) input.setAttribute('aria-describedby', desc); else input.removeAttribute('aria-describedby');
  });
  const first = step.querySelector('.field.bad .input');
  if (first) first.focus();
}

function renderFormStep(s, route) {
  const step = flowEl().querySelector('#flStep');
  const key = `${s.id}|${route.date}|${route.time}|${st.staffId}`;
  if (st.requestKey !== key) { st.requestKey = key; st.requestId = uid(); }
  const p = st.staffId !== 'any' ? staff(st.staffId) : null;
  step.innerHTML = `
    <div class="step-h"><h2 tabindex="-1" id="formTitle">Completá tus datos</h2></div>
    <div class="picked"><div><b>${esc(dateLong(route.date))} · ${esc(route.time)} h</b><span>${esc(s.name)}${p ? ` · con ${esc(p.name)}` : ''}</span></div>
      <button type="button" id="changeSlot">Cambiar</button></div>
    <div id="formNotice"></div>
    <form class="form" id="bookForm" novalidate>
      ${field({ id: 'fullName', label: 'Nombre completo', value: form.fullName, attrs: 'autocomplete="name" placeholder="Nombre y apellido" maxlength="120"' })}
      ${field({ id: 'birthMask', label: 'Fecha de nacimiento', value: form.birthMask, attrs: 'inputmode="numeric" autocomplete="bday" placeholder="DD/MM/AAAA" maxlength="10"' })}
      ${field({ id: 'phone', label: 'Teléfono', type: 'tel', value: form.phone, attrs: 'autocomplete="tel" placeholder="099 123 456" maxlength="20"', help: 'Si tu número no es de Uruguay, escribilo con + y el código de país.' })}
      ${field({ id: 'email', label: 'Mail', type: 'email', value: form.email, attrs: 'autocomplete="email" inputmode="email" placeholder="tu@mail.com" maxlength="160"' })}
      ${field({ id: 'notes', label: 'Info adicional', required: false, textarea: true, value: form.notes, attrs: 'maxlength="1000" placeholder="¿Algo que debamos saber? Alergias, tipo de piel, consultas…"' })}
      <div class="hp" aria-hidden="true"><label for="website">No completar</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
      <button class="btn btn-primary btn-block" type="submit" id="submitBtn">Agendar</button>
      <p class="legal">Usamos tus datos solo para gestionar tu turno y contactarte si hay cambios.</p>
    </form>`;

  step.querySelector('#changeSlot').addEventListener('click', () => back(`#/reservar/${s.id}/${route.date}`));
  const f = step.querySelector('#bookForm');

  const bm = f.querySelector('#birthMask');
  bm.addEventListener('input', () => {
    const d = bm.value.replace(/\D/g, '').slice(0, 8);
    bm.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  });
  f.addEventListener('input', (e) => {
    if (!e.target.name || e.target.name === 'website') return;
    form[e.target.name] = e.target.value;
    saveForm();
    const fl = e.target.closest('.field');
    if (fl && fl.classList.contains('bad')) { fl.classList.remove('bad'); e.target.setAttribute('aria-invalid', 'false'); }
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (st.submitting) return;
    const v = {
      fullName: f.fullName.value, birthMask: f.birthMask.value.trim(), phone: f.phone.value,
      email: f.email.value, notes: f.notes.value, website: f.website.value,
    };
    const today = st.today || todayInTz();
    const errors = validate(v, today);
    showErrors(step, errors);
    if (Object.keys(errors).length) return;

    const btn = f.querySelector('#submitBtn');
    st.submitting = true;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>Guardando tu reserva…</span>';
    const notice = step.querySelector('#formNotice');
    notice.innerHTML = '';
    try {
      const r = await api('/api/bookings', {
        method: 'POST',
        body: {
          serviceId: s.id, date: route.date, time: route.time, staffId: st.staffId, requestId: st.requestId,
          fullName: v.fullName, birthDate: maskToIso(v.birthMask), phone: v.phone, email: v.email, notes: v.notes, website: v.website,
        },
      });
      // Solo llegamos acá si el servidor guardó la reserva.
      try { sessionStorage.setItem(`reserva.ok.${r.token}`, JSON.stringify(r)); } catch { /* sin almacenamiento */ }
      form = {}; saveForm();
      invalidate();
      st.requestKey = null; st.pendingTime = null;
      nav(`#/reserva/${r.token}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'slot_taken') {
        invalidate();
        st.notice = 'Ese horario se acaba de ocupar. Elegí otro, por favor.';
        nav(`#/reservar/${s.id}/${route.date}`, { replace: true });
        return;
      }
      if (err instanceof ApiError && err.fields) {
        showErrors(step, err.fields);
      }
      notice.innerHTML = `<div class="notice err" role="alert">${esc(err.message || 'No pudimos guardar la reserva. Probá de nuevo.')}</div>`;
      notice.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } finally {
      st.submitting = false;
      if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Agendar'; }
    }
  });
}

/* ---------------- Orquestación ---------------- */
export async function renderBooking(route) {
  const s = service(route.service);
  const el = flowEl();
  if (!s) {
    el.dataset.svc = '';
    el.innerHTML = `<div class="fl-bar" aria-hidden="true"></div><button class="back" type="button" id="flBack">${icon.back}<span>Atrás</span></button>
      <div class="done"><div class="card"><h1>Servicio no disponible</h1><p class="lead">Puede que ya no se ofrezca. Elegí otro tratamiento.</p>
      <div class="actions"><a class="btn btn-primary" href="#" id="goHome">Ver tratamientos</a></div></div></div>`;
    el.querySelector('#flBack').onclick = () => back('#');
    el.querySelector('#goHome').onclick = (e) => { e.preventDefault(); back('#'); };
    return;
  }
  if (st.serviceId !== s.id) {
    st.serviceId = s.id; st.staffId = 'any'; st.month = null; st.pendingTime = null; st.notice = null; st.autoJumped = false;
    invalidate();
  }
  if (el.dataset.svc !== s.id || !el.querySelector('#flStep')) shell(s);
  if (route.date) st.month = route.date.slice(0, 7);

  // Botón atrás: datos → horarios → calendario → detalle del tratamiento.
  const parent = route.time ? `#/reservar/${s.id}/${route.date}`
    : route.date && !isDesktop() ? `#/reservar/${s.id}`
      : isDesktop() ? `#/${s.category}` : `#/${s.category}/${s.id}`;
  el.querySelector('#flBack').onclick = () => back(parent);
  updateFacts(s, route);

  if (route.time) {
    // Si alguien entra directo a un horario que ya no existe, vuelve a los horarios.
    renderFormStep(s, route);
    focusStep('#formTitle');
  } else if (route.date && !isDesktop()) {
    const step = el.querySelector('#flStep');
    await paintSlots(route.date, step, { withBack: true });
    focusStep('#slotsTitle');
  } else {
    await renderCalendarStep(s, route);
    if (!route.date) focusStep('#calTitle', { scroll: false });
  }
}

function focusStep(sel, { scroll = true } = {}) {
  requestAnimationFrame(() => {
    const t = flowEl().querySelector(sel);
    if (t) t.focus({ preventScroll: true });
    const step = flowEl().querySelector('#flStep');
    if (scroll && step && !isDesktop()) {
      const top = step.getBoundingClientRect().top + flowEl().scrollTop - 80;
      if (flowEl().scrollTop > top || step.getBoundingClientRect().top > window.innerHeight * 0.6) flowEl().scrollTo({ top, behavior: 'smooth' });
    }
  });
}
