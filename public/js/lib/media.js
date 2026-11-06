// Espacios multimedia reemplazables.
// Si el archivo existe en /public/media se muestra; si no, aparece un marcador
// que indica qué foto o video va ahí y con qué nombre de archivo.
// Inventario completo: MEDIA_PLACEHOLDERS.md
import { esc } from './dom.js';
import { hasMedia } from './data.js';

export function media({ file, label, kind = 'photo', cls = '', compact = false, alt = '', poster = '', eager = false, bare = false }) {
  const has = hasMedia(file);
  if (has && kind === 'video') {
    const p = hasMedia(poster) ? ` poster="/media/${esc(poster)}"` : '';
    return `<div class="media vid-slot ${cls}" data-has="1"><video muted loop playsinline webkit-playsinline preload="metadata" data-auto${p} src="/media/${esc(file)}" aria-label="${esc(label)}"></video></div>`;
  }
  if (has) {
    return `<div class="media ${cls}" data-has="1"><img src="/media/${esc(file)}" alt="${esc(alt || label)}" ${eager ? '' : 'loading="lazy"'} decoding="async"></div>`;
  }
  const tag = kind === 'video' ? 'VIDEO' : kind === 'logo' ? 'LOGO' : 'FOTO';
  // bare: el marcador muestra solo la descripción (sin prefijo ni nombre de archivo).
  const text = kind === 'logo' ? '[LOGO DEL CENTRO]' : bare ? label : `[${tag}: ${label}]`;
  return `<div class="media ${cls}"><div class="ph${compact ? ' compact' : ''}" role="img" aria-label="${esc(`Espacio reservado: ${label}`)}" title="${esc(`${text} → /media/${file}`)}">
    <span class="ph-k">${esc(compact ? tag : text)}</span>${bare ? '' : `<span class="ph-f">${esc(file)}</span>`}</div></div>`;
}
