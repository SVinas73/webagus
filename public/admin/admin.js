// Panel de administración (separado del sitio público, protegido por contraseña).
// Gestiona: reservas, tratamientos, categorías, equipo, horarios, bloqueos,
// textos del sitio, reglas de reserva y archivos multimedia.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');
const dlg = $('#dlg');
const WD = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const STATUS = { pending: 'Pendiente', confirmed: 'Confirmada', cancelled: 'Cancelada', completed: 'Realizada', no_show: 'No asistió' };

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/admin${path}`, {
    method, credentials: 'same-origin',
    headers: { 'x-requested-with': 'fetch', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (res.status === 401 && path !== '/login') { showLogin('Tu sesión expiró. Ingresá de nuevo.'); throw new Error('Sesión expirada'); }
  if (!res.ok) throw new Error(data?.message || 'Error inesperado');
  return data;
}

let toastT;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = `toast show${bad ? ' bad' : ''}`;
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3200);
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo' }).format(new Date());
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const fmtDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); const s = new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))); return s[0].toUpperCase() + s.slice(1); };
const money = (p) => (p == null ? '—' : `$ ${Number(p).toLocaleString('es-UY')}`);

/* ---------- Diálogo genérico ---------- */
function openDialog(title, bodyHTML, { okText = 'Guardar', onOk, extraFoot = '' } = {}) {
  dlg.innerHTML = `<form method="dialog" id="dlgForm">
    <div class="dlg-h"><h3>${esc(title)}</h3><button type="button" class="b b-sm" data-close>Cerrar</button></div>
    <div class="dlg-b">${bodyHTML}</div>
    <div class="dlg-f">${extraFoot}<button type="button" class="b" data-close>Cancelar</button>${onOk ? `<button type="submit" class="b b-primary" id="dlgOk">${esc(okText)}</button>` : ''}</div>
  </form>`;
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  $('#dlgForm', dlg).addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = $('#dlgOk', dlg); if (ok) ok.disabled = true;
    try { if ((await onOk(new FormData(e.target), dlg)) !== false) dlg.close(); } catch (err) { toast(err.message, true); } finally { if (ok) ok.disabled = false; }
  });
  dlg.showModal();
  return dlg;
}

const fld = (label, inner, help = '', cls = '') => `<label class="fld ${cls}"><span>${esc(label)}</span>${inner}${help ? `<small>${esc(help)}</small>` : ''}</label>`;
const inp = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value ?? '')}" ${attrs}>`;
const txa = (name, value = '', attrs = '') => `<textarea name="${name}" ${attrs}>${esc(value ?? '')}</textarea>`;
const sel = (name, options, value, attrs = '') => `<select name="${name}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const chk = (name, checked, label) => `<label class="chk"><input type="checkbox" name="${name}"${checked ? ' checked' : ''}> ${esc(label)}</label>`;

/* ---------- Datos compartidos ---------- */
const cache = {};
async function loadCatalog() {
  [cache.categories, cache.services, cache.staff] = await Promise.all([api('/categories'), api('/services'), api('/staff')]);
}

/* =====================================================
   RESERVAS
   ===================================================== */
const bFilter = { from: todayIso(), to: addDays(todayIso(), 30), status: '', q: '' };

async function tabBookings() {
  const [ov] = await Promise.all([api('/overview'), loadCatalog()]);
  const n = ov.notifications;
  main.innerHTML = `
    <div class="top"><div><h1>Reservas</h1><p class="muted">Hoy es ${esc(fmtDate(ov.today))} · hora de Montevideo</p></div>
      <button class="b b-primary" id="newB">+ Nueva reserva</button></div>
    <div class="kpis">
      <div class="kpi"><b>${ov.todayCount}</b><span>Turnos hoy</span></div>
      <div class="kpi"><b>${ov.upcomingCount}</b><span>Próximos turnos</span></div>
      <div class="kpi"><b>${ov.pendingCount}</b><span>Pendientes de confirmar</span></div>
    </div>
    ${!n.email ? '<div class="alert">Los mails de confirmación están <b>desactivados</b> (falta configurar SMTP en el servidor). Las clientas ven su código de reserva en pantalla, pero no reciben mail.</div>' : ''}
    <div class="box">
      <form class="filters" id="bf">
        ${fld('Desde', `<input type="date" name="from" value="${bFilter.from}">`)}
        ${fld('Hasta', `<input type="date" name="to" value="${bFilter.to}">`)}
        ${fld('Estado', sel('status', [['', 'Todos'], ...Object.entries(STATUS)], bFilter.status))}
        ${fld('Buscar', inp('q', bFilter.q, 'placeholder="Nombre, mail, teléfono o código"'))}
        <button class="b" type="submit">Filtrar</button>
      </form>
    </div>
    <div class="box tbl-wrap" id="bList"><p class="muted">Cargando…</p></div>`;
  $('#bf').addEventListener('submit', (e) => { e.preventDefault(); Object.assign(bFilter, Object.fromEntries(new FormData(e.target))); loadBookings(); });
  $('#newB').addEventListener('click', () => bookingDialog());
  await loadBookings();
}

async function loadBookings() {
  const qs = new URLSearchParams(Object.entries(bFilter).filter(([, v]) => v)).toString();
  const list = await api(`/bookings?${qs}`);
  const box = $('#bList');
  if (!list.length) { box.innerHTML = '<p class="muted">No hay reservas para este filtro.</p>'; return; }
  let lastDay = '';
  const rows = list.map((b) => {
    const sep = b.date !== lastDay ? `<tr class="day-sep"><td colspan="6">${esc(fmtDate(b.date))}</td></tr>` : '';
    lastDay = b.date;
    const active = b.status === 'pending' || b.status === 'confirmed';
    return `${sep}<tr>
      <td><b>${esc(b.time)}</b><div class="sub">${b.duration} min</div></td>
      <td><b>${esc(b.client.fullName)}</b><div class="sub"><a href="https://wa.me/${esc(b.client.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(b.client.phone)}</a> · ${esc(b.client.email)}</div>${b.client.notes ? `<div class="sub">“${esc(b.client.notes)}”</div>` : ''}</td>
      <td>${esc(b.serviceName)}<div class="sub">${money(b.price)}</div></td>
      <td>${esc(b.staffName || '—')}</td>
      <td><span class="pill st-${b.status}">${STATUS[b.status]}</span><div class="sub">#${esc(b.code)}${b.source === 'admin' ? ' · manual' : ''}</div></td>
      <td><div class="row-actions">
        ${b.status === 'pending' ? `<button class="b b-sm" data-st="confirmed" data-id="${b.id}">Confirmar</button>` : ''}
        ${active ? `<button class="b b-sm" data-resched="${b.id}">Reprogramar</button>` : ''}
        ${active ? `<button class="b b-sm" data-st="completed" data-id="${b.id}">Realizada</button>` : ''}
        ${active ? `<button class="b b-sm" data-st="no_show" data-id="${b.id}">No asistió</button>` : ''}
        ${active ? `<button class="b b-sm b-danger" data-st="cancelled" data-id="${b.id}">Cancelar</button>` : `<button class="b b-sm" data-st="confirmed" data-id="${b.id}">Reactivar</button>`}
        <button class="b b-sm" data-detail="${b.id}">Detalle</button>
      </div></td></tr>`;
  }).join('');
  box.innerHTML = `<table><thead><tr><th>Hora</th><th>Clienta</th><th>Tratamiento</th><th>Profesional</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;
  $$('[data-st]', box).forEach((b) => b.addEventListener('click', guard(async () => {
    const st = b.dataset.st;
    let reason = '';
    if (st === 'cancelled') { reason = prompt('Motivo de la cancelación (opcional):') ?? null; if (reason === null) return; }
    await api(`/bookings/${b.dataset.id}/status`, { method: 'PATCH', body: { status: st, reason } });
    toast(`Reserva: ${STATUS[st].toLowerCase()}`);
    loadBookings();
  })));
  $$('[data-resched]', box).forEach((b) => b.addEventListener('click', () => rescheduleDialog(list.find((x) => x.id === Number(b.dataset.resched)))));
  $$('[data-detail]', box).forEach((b) => b.addEventListener('click', () => detailDialog(list.find((x) => x.id === Number(b.dataset.detail)))));
}

function slotPicker(container, { serviceId, date, staff = 'any', exclude, onPick }) {
  container.innerHTML = '<span class="muted">Buscando horarios…</span>';
  if (!serviceId || !date) { container.innerHTML = '<span class="muted">Elegí tratamiento y fecha.</span>'; return; }
  api(`/slots?service=${encodeURIComponent(serviceId)}&date=${date}&staff=${encodeURIComponent(staff)}${exclude ? `&exclude=${exclude}` : ''}`).then(({ slots }) => {
    if (!slots.length) { container.innerHTML = '<span class="muted">Sin horarios libres ese día.</span>'; onPick(null); return; }
    container.innerHTML = `<div class="slots-pick">${slots.map((s) => `<button type="button" data-t="${s.time}">${s.time}</button>`).join('')}</div>`;
    $$('[data-t]', container).forEach((b) => b.addEventListener('click', () => {
      $$('[data-t]', container).forEach((x) => x.classList.toggle('on', x === b)); onPick(b.dataset.t);
    }));
  }).catch((e) => { container.innerHTML = `<span class="err">${esc(e.message)}</span>`; });
}

function staffOptionsFor(serviceId) {
  const svc = cache.services.find((s) => s.id === serviceId);
  const ids = svc ? svc.staff : [];
  return [['any', 'Cualquiera disponible'], ...cache.staff.filter((p) => ids.includes(p.id) && p.active && p.bookable).map((p) => [p.id, p.name])];
}

function rescheduleDialog(b) {
  let time = null;
  const d = openDialog(`Reprogramar · ${b.client.fullName}`, `
    <p class="muted">Actual: ${esc(fmtDate(b.date))} ${esc(b.time)} h · ${esc(b.serviceName)} · ${esc(b.staffName || '')}</p>
    <div class="grid2">${fld('Nueva fecha', `<input type="date" name="date" min="${todayIso()}" value="${b.date}" required>`)}
    ${fld('Profesional', sel('staff', staffOptionsFor(b.serviceId), b.staffId || 'any'))}</div>
    <div class="fld"><span>Horario</span><div id="rsSlots"></div></div>`, {
    okText: 'Reprogramar',
    onOk: async (fd) => {
      if (!time) { toast('Elegí un horario', true); return false; }
      await api(`/bookings/${b.id}/reschedule`, { method: 'PATCH', body: { date: fd.get('date'), time, staffId: fd.get('staff') } });
      toast('Reserva reprogramada'); loadBookings();
    },
  });
  const refresh = () => { time = null; slotPicker($('#rsSlots', d), { serviceId: b.serviceId, date: $('[name=date]', d).value, staff: $('[name=staff]', d).value, exclude: b.id, onPick: (t) => { time = t; } }); };
  $('[name=date]', d).addEventListener('change', refresh);
  $('[name=staff]', d).addEventListener('change', refresh);
  refresh();
}

function bookingDialog() {
  let time = null;
  const svcOpts = cache.services.filter((s) => s.active).map((s) => [s.id, `${s.name} (${s.duration} min)`]);
  const d = openDialog('Nueva reserva manual', `
    <p class="muted">Para turnos tomados por WhatsApp o teléfono. Se verifica la disponibilidad igual que en la web.</p>
    <div class="grid2">
      ${fld('Tratamiento', sel('serviceId', svcOpts, svcOpts[0]?.[0]))}
      ${fld('Profesional', sel('staffId', staffOptionsFor(svcOpts[0]?.[0]), 'any'))}
      ${fld('Fecha', `<input type="date" name="date" min="${todayIso()}" value="${todayIso()}" required>`)}
      ${fld('Estado', sel('status', [['confirmed', 'Confirmada'], ['pending', 'Pendiente']], 'confirmed'))}
    </div>
    <div class="fld"><span>Horario</span><div id="nbSlots"></div></div>
    <div class="grid2">
      ${fld('Nombre completo', inp('fullName', '', 'required'))}
      ${fld('Fecha de nacimiento', '<input type="date" name="birthDate" required>')}
      ${fld('Teléfono', inp('phone', '', 'required type="tel"'))}
      ${fld('Mail', inp('email', '', 'required type="email"'))}
      ${fld('Info adicional', txa('notes'), '', 'span2')}
    </div>`, {
    okText: 'Crear reserva',
    onOk: async (fd) => {
      if (!time) { toast('Elegí un horario', true); return false; }
      const body = Object.fromEntries(fd); body.time = time;
      const b = await api('/bookings', { method: 'POST', body });
      toast(`Reserva creada · #${b.code}`); loadBookings();
    },
  });
  const refresh = () => { time = null; slotPicker($('#nbSlots', d), { serviceId: $('[name=serviceId]', d).value, date: $('[name=date]', d).value, staff: $('[name=staffId]', d).value, onPick: (t) => { time = t; } }); };
  $('[name=serviceId]', d).addEventListener('change', () => {
    $('[name=staffId]', d).outerHTML = sel('staffId', staffOptionsFor($('[name=serviceId]', d).value), 'any');
    $('[name=staffId]', d).addEventListener('change', refresh);
    refresh();
  });
  $('[name=date]', d).addEventListener('change', refresh);
  $('[name=staffId]', d).addEventListener('change', refresh);
  refresh();
}

function detailDialog(b) {
  const hist = b.history.map((h) => `<div>${new Date(h.at).toLocaleString('es-UY', { timeZone: 'America/Montevideo' })} · ${esc(h.action === 'created' ? 'Creada' : h.action === 'rescheduled' ? `Reprogramada de ${h.from} a ${h.to}` : `Estado: ${STATUS[h.status] || h.status}${h.reason ? ` (${h.reason})` : ''}`)} · ${esc(h.by)}</div>`).join('');
  openDialog(`Reserva #${b.code}`, `
    <div class="grid2">
      <div><b>${esc(b.client.fullName)}</b><div class="sub">Nacimiento: ${esc(b.client.birthDate || '—')}</div><div class="sub">${esc(b.client.phone)} · ${esc(b.client.email)}</div></div>
      <div>${esc(b.serviceName)} · ${money(b.price)}<div class="sub">${esc(fmtDate(b.date))} ${esc(b.time)} h · ${b.duration} min · ${esc(b.staffName || '')}</div></div>
    </div>
    ${b.client.notes ? `<p><b>Info de la clienta:</b> ${esc(b.client.notes)}</p>` : ''}
    ${fld('Notas internas', txa('notes', b.adminNotes, 'rows="3"'))}
    <div><b>Historial</b><div class="hist">${hist}</div></div>`, {
    okText: 'Guardar notas',
    onOk: async (fd) => { await api(`/bookings/${b.id}/notes`, { method: 'PATCH', body: { notes: fd.get('notes') } }); toast('Notas guardadas'); loadBookings(); },
  });
}

/* =====================================================
   TRATAMIENTOS
   ===================================================== */
async function tabServices() {
  await loadCatalog();
  main.innerHTML = `<div class="top"><div><h1>Tratamientos</h1><p class="muted">Precio vacío = se muestra “Ver más” y “A confirmar”.</p></div><button class="b b-primary" id="newS">+ Nuevo tratamiento</button></div>
    ${cache.categories.map((c) => {
      const list = cache.services.filter((s) => s.category === c.id);
      return `<div class="box"><h2 style="margin-top:0">${esc(c.title.replace(/_/g, ''))}${c.active ? '' : '<span class="tag">oculta</span>'}</h2>
        ${list.length ? list.map((s, i) => `<div class="list-item"><div><b>${esc(s.name)}</b>${s.active ? '' : '<span class="tag">oculto</span>'}
          <div class="sub">${s.duration} min · ${money(s.price)} · ${s.staff.length} profesional(es)</div></div>
          <div class="row-actions"><span class="drag"><button class="b b-sm" data-up="${s.id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button class="b b-sm" data-down="${s.id}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button></span>
          <button class="b b-sm" data-edit="${s.id}">Editar</button><button class="b b-sm b-danger" data-del="${s.id}">Eliminar</button></div></div>`).join('') : '<p class="muted">Sin tratamientos.</p>'}</div>`;
    }).join('')}`;
  $('#newS').addEventListener('click', () => serviceDialog());
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => serviceDialog(cache.services.find((s) => s.id === b.dataset.edit))));
  $$('[data-del]').forEach((b) => b.addEventListener('click', guard(async () => {
    if (!confirm('¿Eliminar este tratamiento? Las reservas existentes se conservan.')) return;
    await api(`/services/${b.dataset.del}`, { method: 'DELETE' }); toast('Tratamiento eliminado'); tabServices();
  })));
  const move = (id, dir) => guard(async () => {
    const s = cache.services.find((x) => x.id === id);
    const ids = cache.services.filter((x) => x.category === s.category).map((x) => x.id);
    const i = ids.indexOf(id); [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    await api('/reorder/services', { method: 'POST', body: { ids } }); tabServices();
  });
  $$('[data-up]').forEach((b) => b.addEventListener('click', move(b.dataset.up, -1)));
  $$('[data-down]').forEach((b) => b.addEventListener('click', move(b.dataset.down, 1)));
}

function serviceDialog(s = null) {
  const v = s || { category: cache.categories[0]?.id, duration: 60, steps: [], staff: cache.staff.map((p) => p.id), active: true, buffer: 0 };
  openDialog(s ? `Editar · ${s.name}` : 'Nuevo tratamiento', `
    <div class="grid2">
      ${fld('Categoría', sel('category', cache.categories.map((c) => [c.id, c.title.replace(/_/g, '')]), v.category))}
      ${fld('Nombre', inp('name', v.name, 'required maxlength="160"'))}
      ${fld('Subtítulo', inp('subtitle', v.subtitle))}
      ${fld('Duración (minutos)', inp('duration', v.duration, 'type="number" min="5" max="600" required'))}
      ${fld('Precio (UYU)', inp('price', v.price ?? '', 'type="number" min="0"'), 'Vacío = sin precio publicado')}
      ${fld('Foto (archivo)', inp('photo', v.photo, 'placeholder="foto-tratamiento-nombre.webp"'), 'Subila con este nombre en Multimedia')}
      ${fld('Descripción', txa('description', v.description, 'rows="4"'), 'Dejá una línea en blanco para separar párrafos', 'span2')}
      ${fld('Ideal para', inp('ideal', v.ideal), '', 'span2')}
      ${fld('Qué incluye (un paso por línea)', txa('steps', (v.steps || []).join('\n'), 'rows="5"'), '', 'span2')}
      ${fld('Nota', inp('note', v.note), '', 'span2')}
      ${fld('Intervalo entre turnos (min)', inp('slotStep', v.slotStep ?? '', 'type="number" min="5"'), 'Vacío = igual a la duración')}
      ${fld('Margen después del turno (min)', inp('buffer', v.buffer ?? 0, 'type="number" min="0" max="240"'), 'Tiempo de preparación entre clientas')}
    </div>
    <div class="fld"><span>Profesionales que lo realizan</span><div class="row-actions">${cache.staff.map((p) => chk(`staff:${p.id}`, (v.staff || []).includes(p.id), p.name)).join('')}</div></div>
    ${chk('active', v.active !== false, 'Visible en la web')}`, {
    onOk: async (fd) => {
      const body = {
        category: fd.get('category'), name: fd.get('name'), subtitle: fd.get('subtitle'), duration: fd.get('duration'), price: fd.get('price'),
        photo: fd.get('photo'), description: fd.get('description'), ideal: fd.get('ideal'), steps: fd.get('steps').split('\n'),
        note: fd.get('note'), slotStep: fd.get('slotStep'), buffer: fd.get('buffer'), active: fd.has('active'),
        staff: [...fd.keys()].filter((k) => k.startsWith('staff:')).map((k) => k.slice(6)),
      };
      await api(s ? `/services/${s.id}` : '/services', { method: s ? 'PUT' : 'POST', body });
      toast('Tratamiento guardado'); tabServices();
    },
  });
}

/* =====================================================
   CATEGORÍAS
   ===================================================== */
async function tabCategories() {
  await loadCatalog();
  const list = cache.categories;
  main.innerHTML = `<div class="top"><div><h1>Categorías</h1><p class="muted">Cada categoría es un botón de la portada y una pantalla con sus tratamientos. Escribí _así_ la palabra que va resaltada.</p></div><button class="b b-primary" id="newC">+ Nueva categoría</button></div>
    <div class="box">${list.map((c, i) => `<div class="list-item"><div><b>${esc(c.title.replace(/_/g, ''))}</b>${c.active ? '' : '<span class="tag">oculta</span>'}<div class="sub">Botón: “${esc(c.label)}” · /#/${esc(c.id)}</div></div>
      <div class="row-actions"><span class="drag"><button class="b b-sm" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="b b-sm" data-down="${i}" ${i === list.length - 1 ? 'disabled' : ''}>↓</button></span>
      <button class="b b-sm" data-edit="${c.id}">Editar</button><button class="b b-sm b-danger" data-del="${c.id}">Eliminar</button></div></div>`).join('')}</div>`;
  $('#newC').addEventListener('click', () => categoryDialog());
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => categoryDialog(list.find((c) => c.id === b.dataset.edit))));
  $$('[data-del]').forEach((b) => b.addEventListener('click', guard(async () => {
    if (!confirm('¿Eliminar esta categoría?')) return;
    await api(`/categories/${b.dataset.del}`, { method: 'DELETE' }); toast('Categoría eliminada'); tabCategories();
  })));
  const move = (i, dir) => guard(async () => { const ids = list.map((c) => c.id); [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]]; await api('/reorder/categories', { method: 'POST', body: { ids } }); tabCategories(); });
  $$('[data-up]').forEach((b) => b.addEventListener('click', move(Number(b.dataset.up), -1)));
  $$('[data-down]').forEach((b) => b.addEventListener('click', move(Number(b.dataset.down), 1)));
}

function categoryDialog(c = null) {
  const v = c || { active: true };
  openDialog(c ? 'Editar categoría' : 'Nueva categoría', `
    ${fld('Título de la pantalla', inp('title', v.title, 'required placeholder="Sesiones _faciales_"'), 'La palabra entre _guiones bajos_ va resaltada')}
    ${fld('Texto del botón en la portada', inp('label', v.label, 'placeholder="Reservar mi sesión facial"'))}
    ${fld('Foto de cabecera (archivo)', inp('photo', v.photo, 'placeholder="foto-categoria-nombre.webp"'))}
    ${chk('active', v.active !== false, 'Visible en la web')}`, {
    onOk: async (fd) => {
      const body = { title: fd.get('title'), label: fd.get('label'), photo: fd.get('photo'), active: fd.has('active') };
      await api(c ? `/categories/${c.id}` : '/categories', { method: c ? 'PUT' : 'POST', body });
      toast('Categoría guardada'); tabCategories();
    },
  });
}

/* =====================================================
   EQUIPO
   ===================================================== */
async function tabStaff() {
  await loadCatalog();
  const list = cache.staff;
  main.innerHTML = `<div class="top"><div><h1>Equipo</h1><p class="muted">Aparecen en la sección Equipo y, si son reservables, en la agenda.</p></div><button class="b b-primary" id="newP">+ Nueva profesional</button></div>
    <div class="box">${list.map((p, i) => `<div class="list-item"><div><b>${esc(p.name)}</b>${p.featured ? '<span class="tag">destacada</span>' : ''}${p.bookable ? '' : '<span class="tag">no reservable</span>'}${p.active ? '' : '<span class="tag">oculta</span>'}<div class="sub">${esc(p.role)}</div></div>
      <div class="row-actions"><span class="drag"><button class="b b-sm" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="b b-sm" data-down="${i}" ${i === list.length - 1 ? 'disabled' : ''}>↓</button></span>
      <button class="b b-sm" data-edit="${p.id}">Editar</button><button class="b b-sm b-danger" data-del="${p.id}">Eliminar</button></div></div>`).join('')}</div>`;
  $('#newP').addEventListener('click', () => staffDialog());
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => staffDialog(list.find((p) => p.id === b.dataset.edit))));
  $$('[data-del]').forEach((b) => b.addEventListener('click', guard(async () => {
    if (!confirm('¿Eliminar a esta profesional?')) return;
    await api(`/staff/${b.dataset.del}`, { method: 'DELETE' }); toast('Profesional eliminada'); tabStaff();
  })));
  const move = (i, dir) => guard(async () => { const ids = list.map((c) => c.id); [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]]; await api('/reorder/staff', { method: 'POST', body: { ids } }); tabStaff(); });
  $$('[data-up]').forEach((b) => b.addEventListener('click', move(Number(b.dataset.up), -1)));
  $$('[data-down]').forEach((b) => b.addEventListener('click', move(Number(b.dataset.down), 1)));
}

function staffDialog(p = null) {
  const v = p || { active: true, bookable: true };
  openDialog(p ? `Editar · ${p.name}` : 'Nueva profesional', `
    <div class="grid2">${fld('Nombre', inp('name', v.name, 'required'))}${fld('Rol / especialidad', inp('role', v.role))}</div>
    ${fld('Frase de presentación', txa('bio', v.bio, 'rows="2"'))}
    ${fld('Retrato (archivo)', inp('photo', v.photo, 'placeholder="foto-profesional-nombre.webp"'))}
    <div class="row-actions">${chk('featured', v.featured, 'Destacada (va al centro)')}${chk('bookable', v.bookable !== false, 'Toma reservas')}${chk('active', v.active !== false, 'Visible')}</div>
    <p class="muted">Los tratamientos que realiza se eligen en cada tratamiento. Su horario propio se define en Horarios.</p>`, {
    onOk: async (fd) => {
      const body = { name: fd.get('name'), role: fd.get('role'), bio: fd.get('bio'), photo: fd.get('photo'), featured: fd.has('featured'), bookable: fd.has('bookable'), active: fd.has('active') };
      await api(p ? `/staff/${p.id}` : '/staff', { method: p ? 'PUT' : 'POST', body });
      toast('Profesional guardada'); tabStaff();
    },
  });
}

/* =====================================================
   HORARIOS
   ===================================================== */
let hoursScope = '';
async function tabHours() {
  await loadCatalog();
  const all = await api('/hours');
  const rows = all.filter((h) => (h.staff || '') === hoursScope);
  const usesGeneral = hoursScope && !rows.length;
  main.innerHTML = `<div class="top"><div><h1>Horarios de atención</h1><p class="muted">El horario general aplica a todas las profesionales que no tengan uno propio.</p></div></div>
    <div class="box"><div class="filters">${fld('Horario de', sel('scope', [['', 'Centro (general)'], ...cache.staff.map((p) => [p.id, p.name])], hoursScope, 'id="scope"'))}</div></div>
    <div class="box">
      ${usesGeneral ? '<div class="alert">Esta profesional usa el horario general. Si cargás horarios acá, pasa a usar solo los suyos.</div>' : ''}
      <form id="hf"><div class="hours-grid">${[1, 2, 3, 4, 5, 6, 0].map((wd) => `<div class="hours-day" data-wd="${wd}"><b>${WD[wd]}</b><div class="ranges">
        ${rows.filter((h) => h.weekday === wd).map((h) => rangeRow(h.start, h.end)).join('')}
        <div><button type="button" class="b b-sm" data-add>+ Agregar franja</button></div></div></div>`).join('')}</div>
      <div class="row-actions" style="margin-top:1rem"><button class="b b-primary" type="submit">Guardar horarios</button>
      ${hoursScope && !usesGeneral ? '<button class="b" type="button" id="useGeneral">Usar horario general</button>' : ''}</div></form>
    </div>`;
  $('#scope').addEventListener('change', (e) => { hoursScope = e.target.value; tabHours(); });
  const bindRange = (r) => r.querySelector('[data-rm]').addEventListener('click', () => r.remove());
  $$('.range').forEach(bindRange);
  $$('[data-add]').forEach((b) => b.addEventListener('click', () => {
    b.parentElement.insertAdjacentHTML('beforebegin', rangeRow('09:00', '18:00'));
    bindRange(b.parentElement.previousElementSibling);
  }));
  $('#hf').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const out = [];
    $$('.hours-day').forEach((d) => $$('.range', d).forEach((r) => out.push({ weekday: Number(d.dataset.wd), start: $('[name=s]', r).value, end: $('[name=e]', r).value })));
    await api('/hours', { method: 'PUT', body: { staff: hoursScope || null, rows: out } });
    toast('Horarios guardados'); tabHours();
  }));
  const ug = $('#useGeneral');
  if (ug) ug.addEventListener('click', guard(async () => { await api('/hours', { method: 'PUT', body: { staff: hoursScope, rows: [] } }); toast('Ahora usa el horario general'); tabHours(); }));
}
const rangeRow = (s, e) => `<div class="range"><input class="in" type="time" name="s" value="${s}" required> a <input class="in" type="time" name="e" value="${e}" required><button type="button" class="b b-sm b-danger" data-rm>Quitar</button></div>`;

/* =====================================================
   DÍAS BLOQUEADOS
   ===================================================== */
async function tabBlocks() {
  await loadCatalog();
  const list = await api('/blocks');
  const name = (id) => (id ? cache.staff.find((p) => p.id === id)?.name || id : 'Todo el centro');
  main.innerHTML = `<div class="top"><div><h1>Días bloqueados y excepciones</h1><p class="muted">Feriados, vacaciones, licencias o franjas puntuales sin atención. No cancelan reservas ya tomadas: revisalas en Reservas.</p></div></div>
    <div class="box"><form id="blf" class="grid3">
      ${fld('Desde', '<input type="date" name="from" required>')}${fld('Hasta (opcional)', '<input type="date" name="to">')}
      ${fld('Aplica a', sel('staff', [['', 'Todo el centro'], ...cache.staff.map((p) => [p.id, p.name])], ''))}
      ${fld('Desde la hora (opcional)', '<input type="time" name="start">', 'Vacío = día completo')}${fld('Hasta la hora', '<input type="time" name="end">')}
      ${fld('Motivo', inp('reason', '', 'placeholder="Feriado, vacaciones…"'))}
      <div><button class="b b-primary" type="submit">Agregar bloqueo</button></div></form></div>
    <div class="box">${list.length ? list.map((b) => `<div class="list-item"><div><b>${esc(fmtDate(b.from))}${b.to !== b.from ? ` → ${esc(fmtDate(b.to))}` : ''}</b>
      <div class="sub">${b.start ? `${esc(b.start)}–${esc(b.end)}` : 'Día completo'} · ${esc(name(b.staff))}${b.reason ? ` · ${esc(b.reason)}` : ''}</div></div>
      <button class="b b-sm b-danger" data-del="${b.id}">Quitar</button></div>`).join('') : '<p class="muted">Sin bloqueos.</p>'}</div>`;
  $('#blf').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    await api('/blocks', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
    toast('Bloqueo agregado'); tabBlocks();
  }));
  $$('[data-del]').forEach((b) => b.addEventListener('click', guard(async () => { await api(`/blocks/${b.dataset.del}`, { method: 'DELETE' }); toast('Bloqueo quitado'); tabBlocks(); })));
}

/* =====================================================
   TEXTOS DEL SITIO
   ===================================================== */
function listEditor(id, items, fields) {
  const row = (it = {}) => `<div class="lst-row"><div class="grid3">${fields.map(([k, label, type]) => fld(label, type === 'select-type'
    ? sel(k, [['photo', 'Foto'], ['video', 'Video']], it[k] || 'photo') : inp(k, it[k] || ''))).join('')}</div>
    <div><button type="button" class="b b-sm b-danger" data-rmrow>Quitar</button></div></div>`;
  return `<div class="lst" id="${id}">${items.map(row).join('')}</div><button type="button" class="b b-sm" data-addrow="${id}" style="margin-top:.5rem">+ Agregar</button>
    <template id="${id}-tpl">${row()}</template>`;
}
function readList(id, fields) {
  return $$(`#${id} .lst-row`).map((r) => Object.fromEntries(fields.map(([k]) => [k, $(`[name="${k}"]`, r).value.trim()]))).filter((o) => Object.values(o).some((v) => v && v !== 'photo'));
}

const F_SPACE = [['type', 'Tipo', 'select-type'], ['file', 'Archivo'], ['poster', 'Portada del video (opcional)'], ['label', 'Descripción']];
const F_IG = [['url', 'Enlace (reel o .mp4)'], ['cover', 'Portada (archivo)'], ['caption', 'Título']];
const F_GIFT = [['title', 'Opción'], ['message', 'Mensaje de WhatsApp']];
const F_VIDS = [['file', 'Video (archivo)'], ['poster', 'Portada (archivo)'], ['label', 'Descripción']];

async function tabSite() {
  const { site: s } = await api('/settings');
  main.innerHTML = `<div class="top"><div><h1>Textos del sitio</h1><p class="muted">En los títulos, la palabra entre _guiones bajos_ va resaltada.</p></div></div>
  <form id="sf">
    <div class="box"><h2 style="margin-top:0">General</h2><div class="grid2">
      ${fld('Nombre del centro', inp('centerName', s.centerName))}${fld('Frase bajo el logo', inp('tagline', s.tagline))}
      ${fld('Pregunta de la portada', inp('heroQuestion', s.heroQuestion))}${fld('Título de la tarjeta', inp('introTitle', s.introTitle))}
      ${fld('Texto de la tarjeta', txa('introText', s.introText), '', 'span2')}
      ${fld('Título para buscadores y redes', inp('seo.title', s.seo?.title))}${fld('Descripción para buscadores', inp('seo.description', s.seo?.description))}
    </div></div>
    <div class="box"><h2 style="margin-top:0">Contacto</h2><div class="grid2">
      ${fld('WhatsApp (con código de país, solo números)', inp('contact.whatsapp', s.contact.whatsapp, 'placeholder="59899123456"'))}${fld('WhatsApp como se muestra', inp('contact.whatsappDisplay', s.contact.whatsappDisplay))}
      ${fld('Texto bajo WhatsApp', inp('contact.whatsappCaption', s.contact.whatsappCaption))}${fld('Usuario de Instagram (sin @)', inp('contact.instagramUser', s.contact.instagramUser))}
      ${fld('Zona / barrio', inp('contact.addressTitle', s.contact.addressTitle))}${fld('Dirección', inp('contact.addressDetail', s.contact.addressDetail))}
      ${fld('Búsqueda en Google Maps', inp('contact.mapsQuery', s.contact.mapsQuery), '', 'span2')}
    </div></div>
    <div class="box"><h2 style="margin-top:0">Equipo</h2><div class="grid2">${fld('Título', inp('team.title', s.team.title))}${fld('Subtítulo', inp('team.subtitle', s.team.subtitle))}</div></div>
    <div class="box"><h2 style="margin-top:0">El espacio</h2><div class="grid2">${fld('Título', inp('space.title', s.space.title))}${fld('Subtítulo', inp('space.subtitle', s.space.subtitle))}</div>
      ${listEditor('lSpace', s.space.items || [], F_SPACE)}</div>
    <div class="box"><h2 style="margin-top:0">Instagram</h2><div class="grid3">${fld('Título', inp('instagram.title', s.instagram.title))}${fld('Usuario visible', inp('instagram.handle', s.instagram.handle))}${fld('Enlace al perfil', inp('instagram.profileUrl', s.instagram.profileUrl))}</div>
      ${listEditor('lIg', s.instagram.items || [], F_IG)}<p class="muted">Sin elementos, la sección no se muestra.</p></div>
    <div class="box"><h2 style="margin-top:0">Gift card</h2>${chk('gift.enabled', s.gift.enabled, 'Mostrar sección')}
      <div class="grid2">${fld('Título', inp('gift.title', s.gift.title))}${fld('Imagen (archivo)', inp('gift.image', s.gift.image))}${fld('Texto', inp('gift.text', s.gift.text))}${fld('Nota', inp('gift.note', s.gift.note))}</div>
      ${listEditor('lGift', s.gift.options || [], F_GIFT)}</div>
    <div class="box"><h2 style="margin-top:0">Cierre</h2><div class="grid3">${fld('Título', inp('closing.title', s.closing.title))}${fld('Texto', inp('closing.text', s.closing.text))}${fld('Botón', inp('closing.cta', s.closing.cta))}</div>
      ${listEditor('lVids', s.closing.videos || [], F_VIDS)}</div>
    <div class="box"><button class="b b-primary" type="submit">Guardar textos</button></div>
  </form>`;
  bindLists();
  $('#sf').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const out = structuredClone(s);
    for (const [k, v] of fd.entries()) {
      if (!k.includes('.') && ['centerName', 'tagline', 'heroQuestion', 'introTitle', 'introText'].includes(k)) out[k] = v;
      else if (k.includes('.') && !k.startsWith('gift.enabled')) { const [a, b] = k.split('.'); (out[a] ||= {})[b] = v; }
    }
    out.gift.enabled = fd.has('gift.enabled');
    out.space.items = readList('lSpace', F_SPACE);
    out.instagram.items = readList('lIg', F_IG);
    out.gift.options = readList('lGift', F_GIFT);
    out.closing.videos = readList('lVids', F_VIDS);
    await api('/settings/site', { method: 'PUT', body: out });
    toast('Textos guardados');
  }));
}
let listsBound = false;
function bindLists() {
  if (listsBound) return;
  listsBound = true;
  main.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rmrow]'); if (rm) { rm.closest('.lst-row').remove(); return; }
    const add = e.target.closest('[data-addrow]');
    if (add) { const id = add.dataset.addrow; $(`#${id}`).insertAdjacentHTML('beforeend', $(`#${id}-tpl`).innerHTML); }
  });
}

/* =====================================================
   REGLAS DE RESERVA
   ===================================================== */
async function tabRules() {
  const [{ booking: b }, ov] = await Promise.all([api('/settings'), api('/overview')]);
  const n = ov.notifications;
  main.innerHTML = `<div class="top"><div><h1>Reglas de reserva</h1></div></div>
    <form id="rf" class="box"><div class="grid2">
      ${fld('Antelación mínima (horas)', inp('minNoticeHours', b.minNoticeHours, 'type="number" min="0"'), 'No se ofrecen turnos que empiecen antes de este plazo')}
      ${fld('Reservas con hasta (días) de anticipación', inp('maxAdvanceDays', b.maxAdvanceDays, 'type="number" min="1" max="365"'))}
      ${fld('Estado de las reservas web', sel('defaultStatus', [['confirmed', 'Confirmadas al instante'], ['pending', 'Pendientes hasta que las confirme']], b.defaultStatus))}
      ${fld('Texto de opción “cualquier profesional”', inp('anyStaffLabel', b.anyStaffLabel))}
      ${fld('Texto de seña / pago', inp('depositText', b.depositText), 'Se muestra en el flujo de reserva y en la confirmación. Vacío = no se muestra', 'span2')}
      ${fld('Nota en la confirmación', txa('successNote', b.successNote), '', 'span2')}
    </div><button class="b b-primary" type="submit">Guardar reglas</button></form>
    <div class="box"><h2 style="margin-top:0">Notificaciones</h2>
      <p>Mail a la clienta: <b class="${n.email ? 'ok' : 'miss'}">${n.email ? 'activo' : 'sin configurar'}</b></p>
      <p>Mail de aviso al centro: <b class="${n.businessEmail ? 'ok' : 'miss'}">${n.businessEmail ? 'activo' : 'sin configurar'}</b></p>
      <p>Webhook (WhatsApp / automatizaciones): <b class="${n.webhook ? 'ok' : 'miss'}">${n.webhook ? 'activo' : 'sin configurar'}</b></p>
      <p class="muted">Se configuran en el servidor (archivo .env). Ver README → Notificaciones.</p></div>`;
  $('#rf').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    await api('/settings/booking', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) });
    toast('Reglas guardadas');
  }));
}

/* =====================================================
   MULTIMEDIA
   ===================================================== */
async function tabMedia() {
  await loadCatalog();
  const [{ site: s }, files] = await Promise.all([api('/settings'), api('/media')]);
  const have = new Set(files);
  const need = [
    ['logo-centro.svg', 'Logo del centro (SVG con fondo transparente; también sirve logo-centro.png)'],
    ['foto-portada.webp', 'Foto de fondo de la portada (opcional)'],
    ...cache.categories.filter((c) => c.photo).map((c) => [c.photo, `Cabecera: ${c.title.replace(/_/g, '')}`]),
    ...cache.services.filter((x) => x.photo).map((x) => [x.photo, `Tratamiento: ${x.name}`]),
    ...cache.staff.filter((p) => p.photo).map((p) => [p.photo, `Retrato: ${p.name}`]),
    ...(s.space.items || []).flatMap((i) => [[i.file, `Espacio: ${i.label}`], ...(i.poster ? [[i.poster, `Portada de video: ${i.label}`]] : [])]),
    ...(s.instagram.items || []).filter((i) => i.cover).map((i) => [i.cover, `Instagram: ${i.caption || i.url}`]),
    ...(s.gift.image ? [[s.gift.image, 'Gift card']] : []),
    ...(s.closing.videos || []).flatMap((v) => [[v.file, `Cierre: ${v.label}`], ...(v.poster ? [[v.poster, `Portada: ${v.label}`]] : [])]),
  ];
  const seen = new Set();
  const uniq = need.filter(([f]) => f && !seen.has(f) && seen.add(f));
  const extra = files.filter((f) => !seen.has(f) && f !== 'README.md');
  const card = (f, label, isExtra = false) => {
    const ok = have.has(f) || (f === 'logo-centro.svg' && have.has('logo-centro.png'));
    const isVid = /\.(mp4|webm)$/i.test(f);
    const realF = f === 'logo-centro.svg' && !have.has(f) && have.has('logo-centro.png') ? 'logo-centro.png' : f;
    return `<div class="media-card"><div class="pv">${ok ? (isVid ? `<video src="/media/${esc(realF)}" muted preload="metadata"></video>` : `<img src="/media/${esc(realF)}" alt="">`) : `[${isVid ? 'VIDEO' : 'FOTO'} pendiente]`}</div>
      <div class="meta"><span>${esc(label)}</span><code>${esc(f)}</code><span class="${ok ? 'ok' : 'miss'}">${ok ? 'Cargado' : 'Falta'}</span>
      <div class="row-actions"><label class="b b-sm">${ok ? 'Reemplazar' : 'Subir'}<input type="file" hidden data-up="${esc(f)}" accept="${isVid ? 'video/mp4,video/webm' : 'image/*'}"></label>
      ${ok || isExtra ? `<button class="b b-sm b-danger" type="button" data-rm="${esc(realF)}">Borrar</button>` : ''}</div></div></div>`;
  };
  main.innerHTML = `<div class="top"><div><h1>Multimedia</h1><p class="muted">${uniq.filter(([f]) => have.has(f)).length} de ${uniq.length} archivos cargados. El archivo se guarda con el nombre indicado y reemplaza al marcador en la web. Formatos recomendados: fotos .webp, videos .mp4 (H.264), hasta 40 MB.</p></div></div>
    <div class="media-grid">${uniq.map(([f, l]) => card(f, l)).join('')}</div>
    ${extra.length ? `<h2>Otros archivos</h2><div class="media-grid">${extra.map((f) => card(f, 'Sin uso asignado', true)).join('')}</div>` : ''}`;
  $$('[data-up]').forEach((input) => input.addEventListener('change', guard(async () => {
    const file = input.files[0]; if (!file) return;
    if (file.size > 40 * 1024 * 1024) throw new Error('El archivo supera 40 MB');
    toast('Subiendo…');
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    let name = input.dataset.up;
    if (name === 'logo-centro.svg' && !/svg/.test(file.type)) name = 'logo-centro.png';
    await api('/media', { method: 'POST', body: { filename: name, data } });
    toast('Archivo cargado'); tabMedia();
  })));
  $$('[data-rm]').forEach((b) => b.addEventListener('click', guard(async () => {
    if (!confirm(`¿Borrar ${b.dataset.rm}? Volverá a verse el marcador.`)) return;
    await api(`/media/${encodeURIComponent(b.dataset.rm)}`, { method: 'DELETE' }); toast('Archivo borrado'); tabMedia();
  })));
}

/* ---------- Navegación del panel ---------- */
const TABS = { bookings: tabBookings, services: tabServices, categories: tabCategories, staff: tabStaff, hours: tabHours, blocks: tabBlocks, site: tabSite, rules: tabRules, media: tabMedia };
async function go(tab) {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  main.innerHTML = '<p class="muted">Cargando…</p>';
  history.replaceState(null, '', `#${tab}`);
  try { await TABS[tab](); } catch (e) { main.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  main.focus({ preventScroll: true });
}

function showLogin(msg) {
  $('#panel').hidden = true; $('#login').hidden = false;
  if (msg) $('#loginMsg').textContent = msg;
  $('#pw').focus();
}
function showPanel() {
  $('#login').hidden = true; $('#panel').hidden = false;
  const t = location.hash.slice(1);
  go(TABS[t] ? t : 'bookings');
}

$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });
$('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }).catch(() => {}); showLogin('Sesión cerrada.'); });
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  try { await api('/login', { method: 'POST', body: { password: $('#pw').value } }); $('#pw').value = ''; showPanel(); } catch (err) { $('#loginErr').textContent = err.message; }
});

(async () => {
  const me = await fetch('/api/admin/me').then((r) => r.json()).catch(() => ({}));
  if (!me.configured) { showLogin('El panel está deshabilitado: definí ADMIN_PASSWORD en el archivo .env del servidor y reinicialo.'); $('#loginForm button').disabled = true; return; }
  if (me.authenticated) showPanel(); else showLogin();
})();
