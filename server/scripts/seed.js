// Recarga el contenido de demostración.
//   npm run seed              → solo si la base está vacía
//   npm run seed -- --reset   → reemplaza catálogo, equipo, horarios y textos (NO borra reservas)
import { getDb, readSeed, seed } from '../db.js';

const reset = process.argv.includes('--reset');
const d = getDb();
if (reset) {
  seed(d, readSeed(), { reset: true });
  console.log('Contenido de demostración recargado (las reservas se conservaron).');
} else {
  console.log('Base lista. Usá --reset para recargar el contenido de demostración.');
}
