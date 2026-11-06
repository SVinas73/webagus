// Validación de los datos que envía la clienta. Mismos campos que la referencia:
// Nombre completo*, Fecha de nacimiento*, Teléfono*, Mail*, Info adicional.
import { isValidDate } from './time.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizePhone(raw) {
  const s = String(raw || '').trim();
  const plus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (plus) return `+${digits}`;
  // Celular uruguayo escrito sin prefijo: 09X XXX XXX → +5989XXXXXXX
  if (/^09\d{7}$/.test(digits)) return `+598${digits.slice(1)}`;
  if (/^9\d{7}$/.test(digits)) return `+598${digits}`;
  if (/^598\d{8}$/.test(digits)) return `+${digits}`;
  return digits.length >= 8 ? `+${digits}` : digits;
}

export function validateClient(input, todayIso) {
  const errors = {};
  const name = String(input.fullName || '').trim().replace(/\s+/g, ' ');
  const birth = String(input.birthDate || '').trim();
  const phone = normalizePhone(input.phone);
  const email = String(input.email || '').trim().toLowerCase();
  const notes = String(input.notes || '').trim();

  if (!name) errors.fullName = 'Nombre completo es obligatorio';
  else if (name.length < 3 || !/\p{L}/u.test(name)) errors.fullName = 'Ingresá tu nombre completo';
  else if (name.length > 120) errors.fullName = 'El nombre es demasiado largo';

  if (!birth) errors.birthDate = 'Fecha de nacimiento es obligatoria';
  else if (!isValidDate(birth) || birth < '1900-01-01' || birth >= todayIso) errors.birthDate = 'Ingresá una fecha de nacimiento válida';

  const digits = phone.replace(/\D/g, '');
  if (!digits) errors.phone = 'Teléfono es obligatorio';
  else if (digits.length < 8 || digits.length > 15) errors.phone = 'Ingresá un teléfono válido';

  if (!email) errors.email = 'Mail es obligatorio';
  else if (!EMAIL_RE.test(email) || email.length > 160) errors.email = 'Ingresá un mail válido';

  if (notes.length > 1000) errors.notes = 'Máximo 1000 caracteres';

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { fullName: name, birthDate: birth, phone, email, notes },
  };
}

export function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export const RESERVED_IDS = new Set(['reservar', 'reserva', 'admin', 'api', 'media']);
