// Punto de entrada: carga datos, pinta la portada y conecta el router con las capas
// (pantalla de categoría, bottom-sheet y flujo de reserva).
import { loadData, service } from './lib/data.js';
import { isDesktop } from './lib/dom.js';
import { startRouter, back, nav, parse as parseCurrent } from './router.js';
import { renderHome } from './views/home.js';
import { renderCategory, openSheet, closeSheet, isSheetOpen, showPreview } from './views/category.js';
import { renderBooking } from './views/booking.js';
import { renderConfirmation } from './views/confirmation.js';

const root = document.documentElement;
const screen = document.getElementById('screen');
const flow = document.getElementById('flow');
let lastFocus = null;
// Fondo detrás del botón Atrás una vez que la cabecera sale de la vista.
screen.addEventListener('scroll', () => screen.classList.toggle('scrolled', screen.scrollTop > 140), { passive: true });
let lastKey = null;

function openLayer(el) {
  if (el.classList.contains('open')) return;
  if (!screen.classList.contains('open') && !flow.classList.contains('open')) lastFocus = document.activeElement;
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  root.classList.add('lock');
}
function closeLayer(el) {
  if (!el.classList.contains('open')) return;
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  if (!screen.classList.contains('open') && !flow.classList.contains('open')) {
    root.classList.remove('lock');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch { /* elemento ya no existe */ } }
  }
}

function apply(route) {
  const key = location.hash + (isDesktop() ? 'D' : 'M');
  if (key === lastKey) return; // popstate + hashchange pueden llegar juntos
  lastKey = key;

  if (route.name === 'category') {
    const ok = renderCategory(route.cat, {
      onBack: () => back('#'),
      onRow: (id) => nav(`#/${route.cat}/${id}`),
    });
    if (!ok) { nav('#', { replace: true }); return; }
    closeLayer(flow);
    const wasOpen = screen.classList.contains('open');
    openLayer(screen);
    if (!wasOpen) requestAnimationFrame(() => document.getElementById('scrTitle')?.focus({ preventScroll: true }));
    const svc = route.service && service(route.service);
    if (svc && svc.category === route.cat) {
      if (isDesktop()) { closeSheet(); showPreview(svc.id); }
      else openSheet(svc.id, { onClose: () => back(`#/${route.cat}`) });
    } else closeSheet();
    return;
  }

  if (route.name === 'book' || route.name === 'done') {
    closeSheet();
    openLayer(flow);
    if (route.name === 'book') renderBooking(route);
    else renderConfirmation(route.token);
    return;
  }

  // Portada
  closeSheet();
  closeLayer(flow);
  closeLayer(screen);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.vbox.open')) return;
  if (isSheetOpen()) { const c = location.hash.split('/')[1]; back(`#/${c}`); }
  else if (flow.classList.contains('open')) document.getElementById('flBack')?.click();
  else if (screen.classList.contains('open')) back('#');
});

// Al cruzar el breakpoint de escritorio, el detalle cambia de sheet a vista previa.
window.matchMedia('(min-width: 960px)').addEventListener('change', () => { lastKey = null; apply(parseCurrent()); });

(async function init() {
  try {
    await loadData();
  } catch {
    document.getElementById('app').innerHTML = '<p class="state">No pudimos cargar la página. Revisá tu conexión y recargá.</p>';
    return;
  }
  renderHome(document.getElementById('app'));
  startRouter(apply);
  if (/^#[a-z]+$/.test(location.hash)) document.querySelector(location.hash)?.scrollIntoView();
})();
