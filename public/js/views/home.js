// Portada y secciones, en el orden de la referencia:
// Hero → Equipo → El espacio → Instagram → Gift card → Cierre → Pie.
import { esc, rich, plain, waLink, icon, prefersReducedMotion } from '../lib/dom.js';
import { site, categories, staffList, hasMedia } from '../lib/data.js';
import { media } from '../lib/media.js';

function hero(s) {
  const logo = hasMedia('logo-centro.svg')
    ? `<img src="/media/logo-centro.svg" alt="${esc(s.logoAlt || s.centerName)}">`
    : hasMedia('logo-centro.png')
      ? `<img src="/media/logo-centro.png" alt="${esc(s.logoAlt || s.centerName)}">`
      : media({ file: 'logo-centro.svg', label: 'Logo del centro', kind: 'logo' }).replace('class="media ', 'class="media fill ');
  const photo = hasMedia('foto-portada.webp')
    ? `<div class="hero-photo" style="position:absolute;inset:0">${media({ file: 'foto-portada.webp', label: 'Foto de portada', eager: true })}</div>`
    : '';
  return `
  <main class="hero" id="hero">
    ${photo}
    <div class="hero-light" aria-hidden="true"></div>
    <div class="hero-glow" aria-hidden="true"></div>
    <div class="hero-in">
      <div class="logo in d1">${logo}</div>
      <p class="tagline in d2">${esc(s.tagline)}</p>
      <div class="book in d3">
        <h2 class="book-h">${rich(s.heroQuestion)}</h2>
        <nav class="opts" style="--n:${categories().length}" aria-label="Elegí una categoría">
          ${categories().map((c) => `<a class="opt" href="#/${esc(c.id)}"><span>${esc(c.label)}</span><i aria-hidden="true">→</i></a>`).join('')}
        </nav>
      </div>
      <div class="intro-card in d5">
        <h1>${rich(s.introTitle)}</h1>
        <p>${esc(s.introText)}</p>
      </div>
    </div>
    <a class="down" href="#equipo" aria-label="Conocé a tu cosmetóloga">↓</a>
  </main>`;
}

function team(s) {
  const people = staffList();
  if (!people.length) return '';
  // La persona destacada va al medio, como en la referencia.
  const featured = people.find((p) => p.featured);
  const rest = people.filter((p) => p !== featured);
  const ordered = featured ? [...rest.slice(0, Math.floor(rest.length / 2)), featured, ...rest.slice(Math.floor(rest.length / 2))] : people;
  return `
  <section class="sec team" id="equipo">
    <div class="wrap">
      <div class="head rv"><h2>${rich(s.team.title)}</h2><p>${esc(s.team.subtitle)}</p></div>
      <div class="people${ordered.length === 1 ? ' solo' : ''}" id="people">
        ${ordered.map((p) => `
        <article class="person rv${p === featured ? ' featured' : ''}">
          ${media({ file: p.photo, label: `Retrato ${(p.role || 'profesional').split(/[·,]/)[0].trim().toLowerCase()}`, cls: 'pic', bare: true })}
          <h3>${esc(p.name)}</h3>
          <p class="role">${esc(p.role)}</p>
          ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}
        </article>`).join('')}
      </div>
    </div>
  </section>`;
}

function rail(id, label, items) {
  return `
    <div class="gal">
      <button class="gnav prev" type="button" data-rail="${id}" data-dir="-1" aria-label="Anterior">${icon.left}</button>
      <div class="rail" id="${id}" tabindex="0" aria-label="${esc(label)}">${items}</div>
      <button class="gnav next" type="button" data-rail="${id}" data-dir="1" aria-label="Siguiente">${icon.right}</button>
    </div>`;
}

function space(s) {
  const items = s.space.items || [];
  if (!items.length) return '';
  return `
  <section class="sec space" id="espacio">
    <div class="wrap">
      <div class="head rv"><h2>${rich(s.space.title)}</h2><p>${esc(s.space.subtitle)}</p></div>
      ${rail('rail-espacio', 'Fotos y videos del espacio', items.map((it) => media({
        file: it.file, label: it.label, kind: it.type === 'video' ? 'video' : 'photo', poster: it.poster, cls: 'slide rv',
      })).join(''))}
    </div>
  </section>`;
}

function instagram(s) {
  const ig = s.instagram || {};
  const items = ig.items || [];
  if (!items.length) return '';
  return `
  <section class="sec reels" id="videos">
    <div class="wrap">
      <div class="head rv"><h2>${rich(ig.title)}</h2><p>${esc(ig.handle)}</p></div>
      ${rail('rail-ig', 'Publicaciones de Instagram', items.map((it) => {
        const isVideo = /\.(mp4|webm)$/i.test(it.url || '');
        const has = hasMedia(it.cover);
        const inner = `${media({ file: it.cover, label: `Portada: ${it.caption || 'publicación de Instagram'}` })}
          <span class="play" aria-hidden="true"></span>
          <span class="cap">${it.caption ? `<b>${esc(it.caption)}</b>` : ''}${isVideo ? 'Ver video' : 'Ver en Instagram'}</span>`;
        return isVideo
          ? `<button type="button" class="rc rv${has ? ' has-img' : ''}" data-video="${esc(it.url)}">${inner}</button>`
          : `<a class="rc rv${has ? ' has-img' : ''}" href="${esc(it.url)}" target="_blank" rel="noopener">${inner}</a>`;
      }).join(''))}
      ${ig.profileUrl ? `<p class="reels-cta rv"><a class="btn btn-ghost" href="${esc(ig.profileUrl)}" target="_blank" rel="noopener">Seguinos en Instagram</a></p>` : ''}
    </div>
  </section>`;
}

function gift(s) {
  const g = s.gift || {};
  if (!g.enabled) return '';
  return `
  <section class="sec gift" id="gift">
    <div class="wrap gift-in">
      ${media({ file: g.image, label: 'Diseño de la gift card', cls: 'gift-img' })}
      <div class="gift-tx">
        <h2 class="rv">${rich(g.title)}</h2>
        <p class="rv">${esc(g.text)}</p>
        <div class="gift-opts">
          ${(g.options || []).map((o) => `
          <div class="gopt rv">
            <span class="g-t">${esc(o.title)}</span>
            <a class="btn btn-primary" href="${esc(waLink(s.contact.whatsapp, o.message))}" target="_blank" rel="noopener">Pedir por WhatsApp <i>→</i></a>
          </div>`).join('')}
        </div>
        ${g.note ? `<p class="g-note rv">${esc(g.note)}</p>` : ''}
      </div>
    </div>
  </section>`;
}

function closing(s) {
  const c = s.closing || {};
  const ct = s.contact || {};
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ct.mapsQuery || ct.addressDetail || '')}`;
  return `
  <section class="sec close">
    <div class="wrap">
      ${(c.videos || []).length ? `<div class="cvids">${c.videos.map((v) => media({ file: v.file, label: v.label, kind: 'video', poster: v.poster, cls: 'cv rv' })).join('')}</div>` : ''}
      <h2 class="rv">${rich(c.title)}</h2>
      <p class="rv">${esc(c.text)}</p>
      <a class="btn btn-primary rv" href="#hero" data-top>${esc(c.cta || 'Reservar mi sesión')} <i>→</i></a>
      <div class="contact">
        ${ct.whatsapp ? `<a class="rv" href="${esc(waLink(ct.whatsapp))}" target="_blank" rel="noopener">
          <span class="ct-ic">${icon.whatsapp}</span>
          <span><span class="ct-l">WhatsApp</span><span class="ct-v">${esc(ct.whatsappDisplay)}</span>${ct.whatsappCaption ? `<span class="ct-c">${esc(ct.whatsappCaption)}</span>` : ''}</span>
        </a>` : ''}
        ${ct.instagramUser ? `<a class="rv" href="https://www.instagram.com/${esc(ct.instagramUser)}/" target="_blank" rel="noopener">
          <span class="ct-ic">${icon.instagram}</span>
          <span><span class="ct-l">Instagram</span><span class="ct-v">@${esc(ct.instagramUser)}</span></span>
        </a>` : ''}
        ${ct.addressTitle ? `<a class="rv" href="${esc(maps)}" target="_blank" rel="noopener">
          <span class="ct-ic">${icon.pin}</span>
          <span><span class="ct-l">Ubicación</span><span class="ct-v">${esc(ct.addressTitle)}</span>${ct.addressDetail ? `<span class="ct-c">${esc(ct.addressDetail)}</span>` : ''}</span>
        </a>` : ''}
      </div>
    </div>
  </section>
  <footer class="foot">${esc(plain(site().centerName))}</footer>`;
}

export function renderHome(root) {
  const s = site();
  root.innerHTML = `
    ${hero(s)}${team(s)}${space(s)}${instagram(s)}${gift(s)}${closing(s)}`;
  wireHome(root);
}

/* ---------- Comportamientos ---------- */
function wireHome(root) {
  // Brillo que sigue al puntero en la portada (suavizado con rAF).
  const hero = root.querySelector('#hero');
  if (hero && !prefersReducedMotion()) {
    let tx = 50, ty = 30, cx = 50, cy = 30, raf = 0;
    const loop = () => {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      hero.style.setProperty('--mx', `${cx}%`); hero.style.setProperty('--my', `${cy}%`);
      raf = Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1 ? requestAnimationFrame(loop) : 0;
    };
    const move = (e) => {
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 100; ty = ((e.clientY - r.top) / r.height) * 100;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    hero.addEventListener('pointermove', move, { passive: true });
    hero.addEventListener('pointerdown', move, { passive: true });
  }

  // Equipo: en el celular arranca centrado en la persona destacada.
  const people = root.querySelector('#people');
  const f = people && people.querySelector('.featured');
  if (f) {
    const center = () => { people.scrollLeft = f.offsetLeft - (people.clientWidth - f.offsetWidth) / 2; };
    if (document.readyState === 'complete') center(); else window.addEventListener('load', center, { once: true });
  }

  // Flechas de los carruseles (escritorio).
  root.querySelectorAll('.gnav').forEach((b) => {
    const rail = root.querySelector(`#${b.dataset.rail}`);
    const update = () => {
      const prev = b.parentElement.querySelector('.prev'); const next = b.parentElement.querySelector('.next');
      prev.disabled = rail.scrollLeft < 8;
      next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8;
    };
    b.addEventListener('click', () => {
      const first = rail.firstElementChild;
      const w = first ? first.getBoundingClientRect().width + 14 : 300;
      rail.scrollBy({ left: Number(b.dataset.dir) * w * 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
    rail.addEventListener('scroll', update, { passive: true });
    requestAnimationFrame(update);
  });

  // "Reservar mi sesión" del cierre vuelve a la portada.
  root.querySelectorAll('[data-top]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('hero').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }));

  wireVideos(root);
  wireLightbox(root);
  reveal(root);
}

/** Videos: se reproducen solos y sin sonido al entrar en pantalla y se pausan al salir. */
function wireVideos(root) {
  const vids = [...root.querySelectorAll('video[data-auto]')];
  if (!vids.length) return;
  const reduce = prefersReducedMotion();
  vids.forEach((v) => {
    v.muted = true; v.defaultMuted = true;
    const box = v.parentElement;
    v.addEventListener('playing', () => box.classList.remove('nop'));
    box.addEventListener('click', () => { if (v.paused) v.play().catch(() => {}); else v.pause(); });
  });
  if (!('IntersectionObserver' in window)) { vids.forEach((v) => v.parentElement.classList.add('nop')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    const v = en.target;
    if (en.isIntersecting && !reduce) v.play().catch(() => v.parentElement.classList.add('nop'));
    else if (en.isIntersecting) v.parentElement.classList.add('nop');
    else v.pause();
  }), { threshold: 0.3 });
  vids.forEach((v) => io.observe(v));
}

/** Reproductor para videos propios enlazados en la sección de Instagram. */
function wireLightbox(root) {
  const triggers = root.querySelectorAll('[data-video]');
  if (!triggers.length) return;
  const box = document.createElement('div');
  box.className = 'vbox'; box.setAttribute('aria-hidden', 'true');
  box.innerHTML = `<button class="x" type="button" aria-label="Cerrar video">✕</button><video controls playsinline></video>`;
  document.body.appendChild(box);
  const vid = box.querySelector('video');
  const close = () => { box.classList.remove('open'); box.setAttribute('aria-hidden', 'true'); vid.pause(); vid.removeAttribute('src'); vid.load(); };
  triggers.forEach((t) => t.addEventListener('click', () => {
    vid.src = t.dataset.video; box.classList.add('open'); box.setAttribute('aria-hidden', 'false'); vid.play().catch(() => {});
  }));
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('.x')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.classList.contains('open')) close(); });
}

/** Aparición suave de cada bloque al hacer scroll. */
function reveal(root) {
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) return;
  const els = [...root.querySelectorAll('.rv')];
  // Retraso escalonado entre hermanos del mismo tipo.
  const groups = new Map();
  els.forEach((el) => {
    const key = el.parentElement;
    const i = groups.get(key) || 0; groups.set(key, i + 1);
    el.style.setProperty('--d', `${Math.min(i, 5) * 0.09}s`);
  });
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return;
    const el = en.target;
    el.classList.add('seen'); io.unobserve(el);
    const d = parseFloat(el.style.getPropertyValue('--d')) || 0;
    setTimeout(() => el.classList.remove('rv', 'seen'), 1200 + d * 1000);
  }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((el) => io.observe(el));
  document.documentElement.setAttribute('data-fx', '1');
}
