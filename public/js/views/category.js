// Pantalla de categoría (lista tipo menú) + detalle del tratamiento:
// escritorio → tarjeta de vista previa al costado (hover/foco/click);
// móvil → bottom-sheet con ruta propia (#/categoria/servicio).
import { esc, rich, plain, paras, money, durationLabel, icon, isDesktop } from '../lib/dom.js';
import { site, category, servicesOf, service, hasMedia } from '../lib/data.js';
import { media } from '../lib/media.js';

const screenEl = () => document.getElementById('screen');
const sheetEl = () => document.getElementById('sheetWrap');
let currentCat = null;
let hoverT = 0;

const bookHref = (s) => `#/reservar/${s.id}`;

function row(s) {
  const price = money(s.price);
  return `<button class="mrow" type="button" data-svc="${esc(s.id)}" aria-label="${esc(`${s.name}${s.subtitle ? `, ${s.subtitle}` : ''}, ${durationLabel(s.duration)}${price ? `, ${price}` : ''}. Ver detalle`)}">
    ${media({ file: s.photo, label: s.name, cls: 'th', compact: true })}
    <span><span class="nm">${esc(s.name)}</span>${s.subtitle ? `<span class="sb">${esc(s.subtitle)}</span>` : ''}<span class="du">${icon.clock}${esc(durationLabel(s.duration))}</span></span>
    <span class="pr">${price ? esc(price) : '<span class="ar">Ver más →</span>'}</span>
  </button>`;
}

function stats(s) {
  const price = money(s.price);
  return `<div class="stats${price ? '' : ' one'}">
    <div class="stat"><span>Duración</span><b>${esc(durationLabel(s.duration))}</b></div>
    ${price ? `<div class="stat"><span>Precio</span><b>${esc(price)}</b></div>` : ''}
  </div>`;
}

const steps = (s) => (s.steps && s.steps.length
  ? `<h4 class="inc">Qué incluye</h4><ul class="tl">${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');

function previewCard(s) {
  const has = hasMedia(s.photo);
  const right = s.steps && s.steps.length ? `<div>${steps(s)}</div>` : '';
  return `<div class="dcard">
    <div class="pp-photo${has ? ' has-img' : ''}">${media({ file: s.photo, label: `${s.name} (foto del tratamiento)` })}
      <div class="pp-cap"><h3>${esc(s.name)}</h3>${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ''}</div></div>
    <div class="pp-grid${right ? '' : ' one'}">
      <div>${stats(s)}${paras(s.description)}${s.ideal ? `<p class="ideal">${esc(s.ideal)}</p>` : ''}</div>
      ${right}
    </div>
    <div class="pp-foot">${s.note ? `<p class="note">${esc(s.note)}</p>` : '<span></span>'}
      <a class="btn btn-primary" href="${bookHref(s)}">Reservar este servicio <i>→</i></a></div>
  </div>`;
}

export function showPreview(id) {
  const pv = document.getElementById('pv');
  const s = service(id);
  if (!pv || !s || pv.dataset.id === id) return;
  pv.dataset.id = id;
  pv.innerHTML = previewCard(s);
  screenEl().querySelectorAll('.mrow').forEach((r) => {
    const on = r.dataset.svc === id;
    r.classList.toggle('on', on);
    r.setAttribute('aria-current', on ? 'true' : 'false');
  });
}

export function renderCategory(catId, { onBack, onRow }) {
  const c = category(catId);
  const el = screenEl();
  if (!c) return false;
  if (currentCat === catId && el.innerHTML) return true;
  const list = servicesOf(catId);
  const s = site();
  el.innerHTML = `
    <button class="back" type="button" id="scrBack">${icon.back}<span>Atrás</span></button>
    <header class="scr-head">
      <div class="scr-photo${hasMedia(c.photo) ? ' has-img' : ''}" aria-hidden="true">${media({ file: c.photo, label: `Foto de categoría: ${plain(c.title)}` })}</div>
      <div class="scr-headin">
        <div class="scr-brand">${esc(plain(s.centerName))}</div>
        <h2 id="scrTitle" tabindex="-1">${rich(c.title)}</h2>
        <span class="scr-count">${list.length} ${list.length === 1 ? 'tratamiento' : 'tratamientos'}</span>
      </div>
    </header>
    <div class="menu">
      <div class="rows">${list.length ? list.map(row).join('') : '<p class="state">Pronto vas a encontrar tratamientos acá.</p>'}</div>
      <aside class="preview" aria-label="Detalle del tratamiento"><div id="pv" aria-live="polite"></div></aside>
    </div>
    <p class="scr-foot">${esc(plain(s.centerName))}</p><div style="height:3rem"></div>`;
  currentCat = catId;
  el.scrollTop = 0;

  el.querySelector('#scrBack').addEventListener('click', onBack);
  el.querySelectorAll('.mrow').forEach((r) => {
    r.addEventListener('mouseenter', () => { clearTimeout(hoverT); hoverT = setTimeout(() => { if (isDesktop()) showPreview(r.dataset.svc); }, 90); });
    r.addEventListener('mouseleave', () => clearTimeout(hoverT));
    r.addEventListener('focus', () => { if (isDesktop()) showPreview(r.dataset.svc); });
    r.addEventListener('click', () => {
      if (isDesktop()) showPreview(r.dataset.svc);
      else onRow(r.dataset.svc);
    });
  });
  if (list[0]) showPreview(list[0].id);
  return true;
}

export function currentCategory() { return currentCat; }

/* ---------- Bottom-sheet ---------- */
export function openSheet(id, { onClose }) {
  const s = service(id);
  const w = sheetEl();
  if (!s) return false;
  if (w.dataset.id === id && w.classList.contains('open')) return true;
  w.dataset.id = id;
  w.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="shName">
    <span class="grab" aria-hidden="true"></span>
    <button class="sh-x" type="button" id="shX" aria-label="Cerrar">${icon.close}</button>
    <div class="sh-scroll">
      <div class="sh-photo">${media({ file: s.photo, label: `${s.name} (foto del tratamiento)` })}</div>
      <div class="sh-body">
        <h3 class="sh-name" id="shName">${esc(s.name)}</h3>
        ${s.subtitle ? `<p class="sh-sub">${esc(s.subtitle)}</p>` : ''}
        ${stats(s)}
        ${paras(s.description)}
        ${s.ideal ? `<p class="ideal">${esc(s.ideal)}</p>` : ''}
        ${steps(s)}
        ${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}
      </div>
    </div>
    <div class="sh-cta"><a class="btn btn-primary btn-block" href="${bookHref(s)}">Reservar este servicio <i>→</i></a></div>
  </div>`;
  w.classList.add('open');
  w.setAttribute('aria-hidden', 'false');
  w.querySelector('#shX').addEventListener('click', onClose);
  w.onclick = (e) => { if (e.target === w) onClose(); };
  requestAnimationFrame(() => w.querySelector('#shX').focus({ preventScroll: true }));
  return true;
}

export function closeSheet() {
  const w = sheetEl();
  w.classList.remove('open');
  w.setAttribute('aria-hidden', 'true');
  w.dataset.id = '';
}

export function isSheetOpen() { return sheetEl().classList.contains('open'); }
