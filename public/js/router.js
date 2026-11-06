// Router por hash, como la referencia (#/categoria, #/categoria/servicio).
// Rutas extra del sistema propio de reservas:
//   #/reservar/<servicio>                 calendario
//   #/reservar/<servicio>/<AAAA-MM-DD>    horarios del día
//   #/reservar/<servicio>/<fecha>/<HHMM>  datos de la clienta
//   #/reserva/<token>                     confirmación
//
// Cada navegación interna guarda un índice en history.state. Así el botón
// "Atrás" del sitio usa history.back() cuando hay historial propio y, si la
// persona entró por un enlace directo, reemplaza la URL por la pantalla
// anterior sin sacarla del sitio (mismo criterio que la referencia).

let onChange = () => {};

export function parse(hash = location.hash) {
  const m = /^#\/([a-z0-9-]+)(?:\/([A-Za-z0-9_-]+))?(?:\/([0-9-]+))?(?:\/(\d{4}))?$/.exec(hash);
  if (!m) return { name: 'home' };
  const [, a, b, c, d] = m;
  if (a === 'reservar' && b) return { name: 'book', service: b, date: c || null, time: d ? `${d.slice(0, 2)}:${d.slice(2)}` : null };
  if (a === 'reserva' && b) return { name: 'done', token: b };
  return { name: 'category', cat: a, service: b || null };
}

const depth = () => (history.state && history.state.i) || 0;

export function nav(hash, { replace = false } = {}) {
  if (hash === location.hash) { onChange(parse()); return; }
  const url = location.pathname + location.search + hash;
  if (replace) history.replaceState({ i: depth() }, '', url);
  else history.pushState({ i: depth() + 1 }, '', url);
  onChange(parse());
}

/** Volver: usa el historial propio si existe; si no, va a la pantalla padre. */
export function back(parentHash) {
  if (depth() > 0) history.back();
  else nav(parentHash || '#', { replace: true });
}

export function home() {
  const url = location.pathname + location.search;
  history.replaceState({ i: 0 }, '', url);
  onChange(parse(''));
}

export function startRouter(handler) {
  onChange = handler;
  window.addEventListener('popstate', () => onChange(parse()));
  window.addEventListener('hashchange', () => onChange(parse()));
  // Enlaces internos <a href="#/..."> navegan con historial propio.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    nav(a.getAttribute('href'));
  });
  onChange(parse());
}
