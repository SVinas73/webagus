import { config } from './config.js';
import { getDb } from './db.js';
import { createApp } from './app.js';
import { notificationsStatus } from './services/notifications.js';

getDb(); // crea el esquema y carga el contenido de demostración si la base está vacía
const app = createApp();

app.listen(config.port, () => {
  const n = notificationsStatus();
  console.log(`\n  Sitio:  http://localhost:${config.port}`);
  console.log(`  Panel:  http://localhost:${config.port}/admin${config.adminPassword ? '' : '  (deshabilitado: definí ADMIN_PASSWORD en .env)'}`);
  console.log(`  Base:   ${config.dbFile}`);
  console.log(`  Email:  ${n.email ? 'SMTP configurado' : 'sin configurar (no se envían mails)'} · Webhook: ${n.webhook ? 'sí' : 'no'}\n`);
});
