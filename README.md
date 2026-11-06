# Sitio de cosmetología con reservas online

Sitio público pensado para el enlace de la bio de Instagram, con **sistema de reservas propio** (disponibilidad real, verificación en el servidor, sin superposiciones) y **panel de administración** separado.

- Arquitectura y recorrido: reproducen la referencia auditada (ver [REFERENCE_AUDIT.md](REFERENCE_AUDIT.md)).
- Identidad visual: paleta verde / blanco / beige en [public/css/tokens.css](public/css/tokens.css).
- Recursos a incorporar: [MEDIA_PLACEHOLDERS.md](MEDIA_PLACEHOLDERS.md).
- Todo el contenido inicial (nombres, precios, textos, contacto) es **de demostración** y se edita desde `/admin`.

## Puesta en marcha

Requisitos: **Node.js 22.13 o superior** (usa SQLite integrado en Node; no hay dependencias nativas).

```bash
npm install
```

```bash
cp .env.example .env
```

Editá `.env` y definí al menos `ADMIN_PASSWORD`. Luego:

```bash
npm start
```

- Sitio: http://localhost:3000
- Panel: http://localhost:3000/admin

`npm run dev` reinicia el servidor al modificar archivos de `server/`. `npm test` corre las pruebas automatizadas.

La primera vez se crea `data/centro.db` y se carga el contenido de demostración de `data/seed.json`. Para volver a cargarlo (sin borrar reservas):

```bash
npm run seed -- --reset
```

## Estructura

```
server/
  index.js              arranque
  app.js                Express: seguridad, rutas, HTML con catálogo embebido
  config.js             variables de entorno
  db.js                 esquema SQLite, transacciones, carga del contenido demo
  auth.js               sesión del panel, CSRF, límite de intentos
  lib/time.js           conversión de zona horaria (America/Montevideo)
  lib/validation.js     validación de datos de la clienta
  services/catalog.js   categorías, tratamientos, equipo, configuración
  services/availability.js  cálculo de horarios libres
  services/bookings.js  creación, cancelación y reprogramación (con verificación de conflictos)
  services/notifications.js mail SMTP + webhook (reales; nada simulado)
  services/media.js     detección y subida de archivos multimedia
  routes/public.js      API pública
  routes/admin.js       API del panel
public/
  index.html            sitio (SPA con rutas #/…)
  css/                  tokens (paleta y tipografía), base, portada, pantallas, reserva
  js/main.js            arranque y capas
  js/router.js          rutas hash + botón atrás coherente
  js/views/             portada, categoría, reserva, confirmación
  js/lib/               datos, API, marcadores multimedia, utilidades
  admin/                panel de administración
  media/                tus fotos, videos y logo
data/seed.json          contenido de demostración
tests/                  pruebas (node:test)
```

## Rutas del sitio

| Ruta | Pantalla |
|---|---|
| `/` | Portada + secciones |
| `/#/<categoria>` | Lista de tratamientos (escritorio: con vista previa al costado) |
| `/#/<categoria>/<tratamiento>` | Detalle en bottom-sheet (celular) |
| `/#/reservar/<tratamiento>` | Calendario |
| `/#/reservar/<tratamiento>/<AAAA-MM-DD>` | Horarios del día |
| `/#/reservar/<tratamiento>/<fecha>/<HHMM>` | Datos de la clienta |
| `/#/reserva/<token>` | Confirmación |

Podés enlazar directo a una categoría desde una historia de Instagram, por ejemplo `https://tu-dominio.com/#/facial`.

## Sistema de reservas

- **Disponibilidad:** horario general del centro + horario propio opcional por profesional, días/franjas bloqueados, duración de cada tratamiento, intervalo entre turnos, margen de preparación, antelación mínima y máxima.
- **Conflictos:** la verificación definitiva se hace en el servidor dentro de una transacción exclusiva de SQLite; un índice único impide dos reservas activas de la misma profesional a la misma hora. Probado con 20 solicitudes simultáneas por el mismo horario: se confirma 1 y las otras 19 reciben "ese horario ya no está disponible".
- **Reintentos:** cada envío lleva un identificador; si la conexión se corta y la clienta reintenta, no se duplica la reserva.
- **Estado:** confirmada al instante o pendiente (configurable en Reglas de reserva). La pantalla de confirmación solo aparece después de que el servidor guardó la reserva y muestra el estado real.
- **Zona horaria:** `America/Montevideo`. Las reservas se guardan en UTC y en hora local.
- **Datos que se piden** (los mismos que la referencia): nombre completo, fecha de nacimiento, teléfono, mail e info adicional (opcional).

## Notificaciones

Nada se simula: si una integración no está configurada, no se envía nada y la web no dice que se envió.

| Integración | Variables | Qué hace |
|---|---|---|
| Mail (SMTP) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Confirmación a la clienta. La pantalla de confirmación dice "Te enviamos los detalles a…" solo si el envío fue exitoso. |
| Aviso al centro | `MAIL_NOTIFY_TO` | Mail al centro por cada reserva nueva. |
| Webhook | `BOOKING_WEBHOOK_URL`, `BOOKING_WEBHOOK_SECRET` | `POST` JSON en cada reserva nueva, cancelación o reprogramación (`booking.created`, `booking.status`, `booking.rescheduled`), firmado con HMAC-SHA256 en `x-signature`. Sirve para mandar WhatsApp automáticos vía Make, Zapier, n8n o la API de WhatsApp Business. |

Cualquier proveedor SMTP sirve (Gmail con contraseña de aplicación, Zoho, Brevo, Resend, etc.).

## Panel de administración (`/admin`)

Protegido con `ADMIN_PASSWORD`, cookie de sesión firmada (httpOnly, SameSite=Strict), defensa CSRF y límite de intentos de acceso.

- **Reservas:** agenda por día, filtros, búsqueda, confirmar, marcar realizada / no asistió, cancelar (libera el horario), reactivar, reprogramar (con horarios libres reales), notas internas, historial de cambios y carga manual de turnos tomados por WhatsApp o teléfono.
- **Tratamientos / Categorías / Equipo:** crear, editar, ocultar, ordenar, eliminar; qué profesional hace cada tratamiento.
- **Horarios:** general y por profesional, varias franjas por día.
- **Días bloqueados:** feriados, vacaciones o franjas puntuales, para todo el centro o una profesional.
- **Textos del sitio:** portada, equipo, espacio, Instagram, gift card, cierre, contacto y SEO.
- **Reglas de reserva:** antelación, anticipación máxima, estado por defecto, texto de seña.
- **Multimedia:** qué archivo falta en cada lugar y subida directa con el nombre correcto.

## Tipografía

Combinación editorial tomada de la referencia visual elegida:

- **Titulares:** Cormorant Garamond (serif fina de alto contraste), con la palabra destacada en itálica.
- **Textos, botones, etiquetas y formularios:** Jost (sans geométrica, muy legible).

Las dos son de Google Fonts (licencia libre SIL OFL). Todas las reglas tipográficas están en [public/css/typography.css](public/css/typography.css) y las familias en `--serif` / `--sans` de [public/css/tokens.css](public/css/tokens.css).

## Publicación (hosting)

Cualquier hosting Node con **disco persistente** (Railway, Render con disco, Fly.io con volumen, un VPS):

1. `npm install --omit=dev` y `npm start`.
2. Variables: `NODE_ENV=production`, `ADMIN_PASSWORD`, `SESSION_SECRET` (≥ 32 caracteres), `PUBLIC_URL`, y `DATA_DIR` apuntando al volumen persistente.
3. HTTPS obligatorio (lo da el hosting).
4. Respaldo: copiar periódicamente el archivo `centro.db` de `DATA_DIR`.
5. `public/media/` también debe quedar en disco persistente (o subir los archivos en cada despliegue).

No sirve un hosting "serverless" sin disco (por ejemplo Vercel/Netlify funciones), porque la base de datos es un archivo.

## Privacidad

El sitio pide datos personales (incluida la fecha de nacimiento, porque la referencia la solicita). Se guardan solo en tu servidor. Recomendado: agregar tu política de privacidad y cumplir la Ley 18.331 de Protección de Datos Personales de Uruguay.
