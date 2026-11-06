// Fuente única de datos de la web: el catálogo que viene embebido en el HTML
// (o, si no está, desde /api/catalog). Ningún componente tiene datos propios.

let data = null;

export async function loadData() {
  const boot = document.getElementById('boot');
  if (boot) {
    try { data = JSON.parse(boot.textContent); } catch { data = null; }
  }
  if (!data) {
    const r = await fetch('/api/catalog');
    if (!r.ok) throw new Error('No se pudo cargar el catálogo');
    data = await r.json();
  }
  data.mediaSet = new Set(data.media || []);
  return data;
}

export const site = () => data.site;
export const bookingCfg = () => data.booking;
export const categories = () => data.categories;
export const category = (id) => data.categories.find((c) => c.id === id) || null;
export const servicesOf = (catId) => data.services.filter((s) => s.category === catId);
export const service = (id) => data.services.find((s) => s.id === id) || null;
export const staffList = () => data.staff;
export const staff = (id) => data.staff.find((p) => p.id === id) || null;
export const hasMedia = (file) => !!file && data.mediaSet.has(file);
