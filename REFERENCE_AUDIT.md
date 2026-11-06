# REFERENCE_AUDIT.md — Auditoría de la referencia

Fecha de la auditoría: 2026-11-05 · Herramienta: navegador integrado de Claude (Chromium), inspección de DOM, ejecución de JS en página, lectura de código fuente de los bloques custom, emulación de viewport 375×812 (móvil) y 1280×800 (escritorio).

> REA MCP figura como disponible en el entorno, pero sus herramientas web son de captura/análisis de artefactos; la auditoría se hizo íntegramente con el navegador integrado, que permitió leer el DOM completo, el código fuente de cada pantalla y operar el widget de reservas. Las capturas están en `docs/audit/reference/` (excluidas de git porque contienen fotografías de terceros).

---

## 1. Resumen ejecutivo

| Aspecto | Hallazgo |
|---|---|
| Plataforma | **GoHighLevel / LeadConnector** (funnel builder Nuxt). Cada pantalla es un *step* de funnel que contiene **un único bloque de "código personalizado"** con HTML+CSS+JS escrito a mano. |
| Sistema de reservas | **Widget de calendario de LeadConnector** (`api.leadconnectorhq.com/widget/booking/<id>`), abierto en **pestaña nueva** (`target="_blank"`) desde el botón "Reservar este servicio". 3 calendarios: facial, espalda, masaje. |
| Dos versiones del sitio | (a) Flujo multi-página: `/` → `/categorias` → `/opciones*` (modal) → widget. (b) **`/agenda_web`**: SPA de una sola página con rutas *hash* (`#/facial`, `#/facial/<servicio>`), secciones de Team, Espacio, Instagram, Gift card y Contacto. La versión (b) es la más reciente y completa: **se toma como arquitectura principal**. La (a) queda documentada como referencia secundaria. |
| Zona horaria | `America/Montevideo (GMT-3)` (confirmado en el widget). |
| Moneda | UYU. El widget muestra "SEÑA $500" como dato informativo. |
| Notificaciones | No verificables sin crear una reserva real (ver §9). Contacto visible: WhatsApp (enlaces `wa.me`), Instagram, Google Maps. |
| Cookies / storage | Cookie `msgsndr_id` y claves `v2_*/v3_*` en localStorage: tracking de sesión de GHL. Cloudflare Insights. Ninguna se usa para la lógica de reserva del sitio. |

---

## 2. Mapa de pantallas

### 2.1 Versión principal — `/agenda_web` (SPA, hash routing)

```
/agenda_web
├── HERO (#hero) ───────────── pantalla inicial (min-height 100svh)
│   ├── Logo circular (borde fino, blur) "AURORA / SKIN"
│   ├── Tagline "ESTUDIO DE PIEL"
│   ├── H2 "¿Qué estás buscando hoy?"
│   ├── 3 botones-píldora blancos → #/facial · #/espalda · #/masaje
│   ├── Tarjeta translúcida: ✦ "Tu cuidado, tu momento." + texto
│   └── Botón circular ↓ → #equipo (animación "bob")
├── TEAM (#equipo) ─────────── carrusel horizontal (móvil) / fila centrada (≥820px)
│   └── 3 personas: foto 3:4 con arco superior, nombre, rol, frase. La del medio "featured" (centrada al cargar en móvil)
├── EL ESPACIO (#espacio) ──── carrusel de slides 3:4 (2 videos autoplay mudos + 9 fotos), flechas ‹ › solo ≥820px
├── EN INSTAGRAM (#videos) ─── carrusel de tarjetas 9:16 con portada + ▶ que abren reels en Instagram (nueva pestaña) + botón "Seguinos en Instagram". Sección oculta si la lista está vacía. Soporta video propio en lightbox (.vbox)
├── GIFT CARD (#gift) ──────── imagen de la gift card rotada -3° + "Regalá una sesión" + 2 opciones (digital / cartón) con botón "Comprar acá →" que abre WhatsApp con mensaje prellenado + nota
├── CIERRE (.close) ────────── tira de 5 videos 9:16 autoplay mudos · H2 "Tu momento te espera" · texto · CTA "Reservar mi sesión →" (→ #hero) · contacto (WhatsApp, Instagram, Ubicación con Google Maps)
├── FOOTER ─────────────────── wordmark "AURORA SKIN"
│
├── PANTALLA DE CATEGORÍA  #/<cat>   (div.screen fijo a pantalla completa, role=dialog)
│   ├── Botón "← Atrás" fijo arriba-izquierda (píldora translúcida)
│   ├── Cabecera: marca + H2 con 2ª palabra en itálica (foto de fondo opcional por categoría)
│   ├── Lista tipo menú: fila = miniatura circular 68px · nombre (serif) · subtítulo · duración · precio (o "VER MÁS →" si no hay precio)
│   ├── ≥960px: columna derecha "preview" sticky con tarjeta de detalle completa (foto, stats, descripción, ideal, "Qué incluye", nota, botón reservar). Hover/focus en una fila cambia la tarjeta. Click en fila (desktop) = actualizar preview, NO abre modal.
│   └── Pie: marca
│
└── DETALLE DE SERVICIO  #/<cat>/<servicio>  (solo <960px) — bottom-sheet (div.sheet-wrap)
    ├── Foto superior 200px con degradado + botón ✕ circular translúcido
    ├── Nombre (serif itálica) · subtítulo
    ├── Stats: "Duración" y "Precio" en cajitas (una sola si no hay precio)
    ├── Descripción (párrafos separados por \n\n) · caja "Ideal…" con borde izquierdo
    ├── "Qué incluye": línea de tiempo vertical con puntos
    ├── Nota en itálica
    └── CTA fijo abajo "RESERVAR ESTE SERVICIO →" (→ widget en nueva pestaña) con safe-area-inset-bottom
        ≥640px el sheet se centra como modal con radio completo
```

### 2.2 Versión secundaria — flujo multipágina

```
/                       Portada: logo circular 140px, tagline, divisor ✦, "Tu cuidado, tu momento.", texto, botón "RESERVAR MI SESIÓN →" → /categorias
/categorias             "← ATRÁS" (→ /primer-paso, que devuelve 404 ⚠), logo 72px, "¿Qué estás buscando hoy?", "ELEGÍ UNA CATEGORÍA", ornamento ···, 3 tarjetas de categoría (label "CATEGORÍA", nombre, "VER SERVICIOS →")
/opciones               Sesiones faciales: grilla 2 columnas (1 col <380px) de 8 tarjetas (nombre, ⏱ duración, ⓘ precio, "VER MÁS →") → modal bottom-sheet
/opciones-higiene-espalda   1 tarjeta → modal
/opciones-masaje-facial     1 tarjeta → modal
```

### 2.3 Widget de reservas (LeadConnector, externo)

```
Paso 1  Calendario: logo, nombre del calendario, caja info (⏱ duración, 📅 fecha seleccionada, 🌐 zona horaria, ≡ "SEÑA $500", descripción truncada + "Mostrar más"), selector "Cualquier miembro del personal disponible" (solo calendarios con >1 profesional), mes con ‹ ›, días disponibles en círculo coloreado, no disponibles en gris, hoy marcado con punto, selector de zona horaria.
Paso 2  (móvil) vista de horarios: ← volver, día de la semana + fecha, zona horaria, "Seleccionar Ventana de tiempo", "Duración : 75 min", lista de botones con horas (09:15, 10:30, 14:45). Al tocar una hora se divide: [hora en gris] [Seleccionar].
Paso 3  Formulario "Introduzca los detalles": Sesión* (radio, solo calendario facial), Nombre Completo*, Fecha de nacimiento* (DD-MM-YYYY), Teléfono* (selector de país, +598), Mail*, Info adicional (opcional), botón "Agendar".
Paso 4  Confirmación: NO VERIFICADA (requiere crear una reserva real en un negocio real).
```

---

## 3. Mapa de navegación

```
agenda_web:
  #hero ──(opción categoría)──► #/facial ──(fila, móvil)──► #/facial/<svc> ──(Reservar)──► widget (nueva pestaña)
     ▲                            │  ▲                          │
     │                    (← Atrás / Esc / back)       (✕ / overlay / Esc / back)
     └────────────────────────────┘  └──────────────────────────┘
  #hero ──(↓)──► #equipo        .close CTA ──► #hero

multipágina:
  / ──► /categorias ──► /opciones | /opciones-higiene-espalda | /opciones-masaje-facial ──(modal)──► widget
          └─(← Atrás)─► /primer-paso (404)      └─(← Atrás)─► /categorias
```

Comportamiento del "Atrás" en agenda_web (verificado en el código): si la pantalla se abrió por un click interno, usa `history.back()`; si se entró por URL directa, hace `replaceState` a la URL limpia. Lo mismo para el sheet. Así el botón "atrás" del teléfono y el del sitio son coherentes y no sacan al usuario del sitio.

---

## 4. Inventario de componentes

| Componente | Dónde | Detalle verificado |
|---|---|---|
| Logo circular | Hero, portada, categorías | 158–184px (hero), 124/116px en móviles bajos, borde 1px, backdrop-blur |
| Botón-píldora de categoría | Hero | min-height 72px (60–56 móvil), fondo blanco, flecha que se desplaza 5px al hover, sombra suave; en fila a partir de 820px |
| Tarjeta intro translúcida | Hero | brillo diagonal animado cada 8s (desactivado con reduced-motion) |
| Botón ↓ | Hero | 44px, animación bob 2.4s |
| Tarjeta de persona | Team | foto 3:4 con radio "arco", hover eleva 6px |
| Carrusel (rail) | Espacio, Instagram, cierre | scroll-snap, sin scrollbar, flechas solo escritorio, avance de 2 slides |
| Slide de video | Espacio, cierre | autoplay mudo con IntersectionObserver (pausa fuera de pantalla), fallback "▶" si el navegador bloquea autoplay, tap = play/pause |
| Tarjeta reel | Instagram | 9:16, portada, ▶ con blur, caption "VER EN INSTAGRAM" |
| Lightbox de video | Instagram | `.vbox`, cierra con ✕, click fuera o Esc |
| Opción de gift card | Gift | título serif + botón "Comprar acá →" (WhatsApp prellenado) |
| Contacto | Cierre | ícono circular 48px + label + valor + caption |
| Pantalla de categoría | `#/cat` | `position:fixed`, transición opacity+translateY(26px), bloquea scroll del body, foco al título |
| Fila de servicio | Lista | grid 68px/1fr/auto, hover/activo con fondo degradado y padding-left |
| Tarjeta preview | Lista ≥960px | sticky, animación popin .28s |
| Bottom-sheet | `#/cat/svc` | translateY(100%)→0 en .45s cubic-bezier(.32,.72,0,1), max-height 92vh, CTA fijo |
| Línea de tiempo "Qué incluye" | Sheet/preview | puntos con borde, línea vertical |
| Botón "Atrás" | Pantallas | píldora fija arriba-izquierda, 44px de alto |
| Calendario | Widget | mes, ‹ ›, estados disponible/no disponible/hoy/seleccionado |
| Botón de horario | Widget | contorno; al seleccionar se divide en hora + "Seleccionar" |
| Formulario | Widget | etiquetas encima, asterisco de obligatorio, errores en rojo debajo de cada campo |

---

## 5. Funcionalidades comprobadas

- [x] Portada `/` y botón principal → `/categorias`.
- [x] `/categorias`: 3 categorías con enlaces a sus páginas. **"← Atrás" apunta a `/primer-paso`, que devuelve 404** (bug de la referencia; no se reproduce).
- [x] `/opciones`: 8 tratamientos, modal con datos completos desde un objeto JS. **Inconsistencia de la referencia**: "Higiene premium" muestra 1850 UYU en la tarjeta y 1800 UYU en el modal (no se reproduce: en nuestra arquitectura el precio sale de una sola fuente).
- [x] Modal: cierre con ✕, click en overlay; Esc solo en `/opciones-higiene-espalda`. En `/opciones` el botón Reservar abre en nueva pestaña; en espalda abre en la misma pestaña (inconsistencia).
- [x] `/agenda_web`: hero, rutas hash, pantalla de categoría, sheet (móvil), preview (escritorio), hover → preview, back del navegador, Esc, foco gestionado, `aria-modal`.
- [x] Secciones Team / Espacio / Instagram / Gift / Cierre / Footer y sus enlaces externos.
- [x] Widget: calendario con días disponibles/no disponibles, selector de profesional, selección de fecha → lista de horarios, selección de hora → botón "Seleccionar", formulario con campos y validación de obligatorios ("X es obligatorio").
- [x] Duración de turnos: 75 min (facial), 60 min (espalda y masaje). Horarios observados para facial el 10/11: 09:15, 10:30, 14:45 → los slots se generan cada *duración del servicio* y desaparecen los ocupados.
- [x] Domingos no disponibles; algunos días laborables sin cupo; hoy y los días inmediatos sin cupo (antelación mínima o agenda llena — no distinguible desde fuera).

## 6. Interacciones comprobadas

| Interacción | Resultado |
|---|---|
| Hover en botones del hero | translateY(-2px), sombra mayor, flecha +5px |
| Entrada del hero | fade-up escalonado (.35s–1.1s) |
| Scroll | aparición suave de secciones (IntersectionObserver), desactivada con `prefers-reduced-motion` |
| Brillo que sigue al puntero en el hero | radial-gradient que sigue al mouse/dedo con suavizado |
| Abrir categoría | pantalla sube 26px + fade |
| Abrir detalle (móvil) | sheet sube desde abajo |
| Cerrar | ✕, click fuera, Esc, botón atrás del navegador |
| Hover en fila (desktop) | preview cambia tras 90ms |
| Videos | autoplay mudo al entrar en pantalla, pausa al salir |

## 7. Comportamiento responsive

| Breakpoint | Cambio |
|---|---|
| < 380px | (multipágina) grilla de tratamientos a 1 columna |
| ≤ 819px | hero compacto; botones de categoría apilados; contacto en columna |
| ≤ 819px y alto ≤ 700px | logo y botones más chicos para que todo entre sin scroll |
| ≥ 640px | sheet de detalle centrado como modal |
| ≥ 820px | botones de categoría en fila; team centrado sin scroll; flechas de carrusel; gift en 2 columnas |
| ≥ 960px | lista + preview en 2 columnas; el click en fila no abre modal |
| ≥ 1600 / 1900px | escalado de `font-size` raíz y anchos máximos |

## 8. Diferencias escritorio / móvil

- Móvil: detalle en bottom-sheet con ruta propia (`#/cat/svc`); escritorio: tarjeta preview fija junto a la lista, sin cambiar de ruta.
- Móvil: carruseles con swipe y scroll-snap; escritorio: flechas.
- Widget móvil: calendario y horarios en vistas separadas con flecha de volver; escritorio: columna de información a la izquierda y calendario a la derecha (verificado parcialmente).

## 9. Integraciones externas

| Integración | Uso | ¿Reutilizable? |
|---|---|---|
| LeadConnector Booking Widget | Agenda | **No.** Está atado a la cuenta GHL de Aurora (IDs de calendario propios, staff, contactos). Requeriría una cuenta GHL paga del nuevo negocio y no permite aplicar nuestra identidad visual dentro del widget. **Decisión: sistema de reservas propio** que reproduce el recorrido del widget (calendario → horario → "Seleccionar" → formulario → confirmación) dentro del mismo sitio. |
| WhatsApp `wa.me` | Gift cards, contacto | Sí: enlaces configurables con el número del nuevo centro. |
| Instagram | Reels y perfil | Sí: lista configurable de enlaces + portadas propias. |
| Google Maps search URL | Ubicación | Sí: dirección configurable. |
| Google Fonts | Tipografías | Sí (usamos otra combinación). |
| Cloudflare Insights / GHL tracking | Analítica | No se reproduce. |

## 10. Características NO verificadas

- Pantalla de confirmación del widget tras "Agendar" (requiere reservar en un negocio real; no se hizo).
- Emails/SMS/WhatsApp automáticos de confirmación o recordatorio (GHL suele tenerlos, pero no es observable desde fuera).
- Enlaces de cancelación/reprogramación para la clienta (habituales en GHL, no observados). **No se inventan del lado público**: la cancelación y reprogramación se gestionan desde el panel de administración, y la pantalla de éxito ofrece WhatsApp para cambios.
- Cobro real de la "SEÑA $500" (en el widget aparece como texto informativo; no se observó paso de pago antes del formulario).
- Reglas exactas de antelación mínima y horario laboral (solo se infieren).
- Estados de carga del widget (la carga fue instantánea en las pruebas) y errores del servidor.

## 11. Decisiones de reproducción

1. **Arquitectura = `/agenda_web`** (SPA con hash routing): una sola URL ideal para la bio de Instagram, rápida en el navegador interno de Instagram, back del teléfono coherente.
2. El widget externo se reemplaza por un **flujo de reserva propio** con la misma secuencia y campos. Se elimina la pregunta "Sesión" (radio) porque en la referencia existe solo porque un calendario agrupa varios servicios; en el nuevo sistema el servicio ya viene elegido.
3. El flujo de reserva se abre **dentro del sitio** (ruta `#/reservar/<servicio>`) en vez de una pestaña nueva: en el navegador de Instagram una pestaña nueva saca a la usuaria de la experiencia.
4. Bugs de la referencia no reproducidos: 404 de `/primer-paso`, precio inconsistente, comportamiento de Esc/pestaña inconsistente.
5. Todos los datos comerciales (nombres, precios, textos, equipo, contacto) son **DEMO** y editables desde el panel.

## 12. Checklist de reproducción

- [x] Hero con logo circular, tagline, título, botones de categoría dinámicos, tarjeta intro, botón ↓
- [x] Team (carrusel móvil, persona destacada centrada)
- [x] El espacio (carrusel mixto foto/video con flechas en escritorio)
- [x] Instagram (tarjetas 9:16, oculta si no hay elementos)
- [x] Gift card con WhatsApp prellenado
- [x] Cierre con videos, CTA → hero, contacto
- [x] Footer
- [x] Pantalla de categoría con "← Atrás", cabecera, lista tipo menú
- [x] Preview sticky en escritorio (hover/focus/click)
- [x] Bottom-sheet en móvil con ruta propia, ✕, overlay, Esc, back
- [x] Rutas hash y back del navegador coherentes
- [x] Flujo de reserva: calendario (disponible/no disponible/hoy/seleccionado), selector de profesional, horarios, "Seleccionar", formulario (Nombre completo, Fecha de nacimiento, Teléfono +598, Mail, Info adicional), validación, confirmación
- [x] Disponibilidad real desde servidor, verificación de conflictos en servidor
- [x] Zona horaria America/Montevideo
- [x] Animaciones: fade-up, reveal on scroll, transiciones de pantalla/sheet, hover; `prefers-reduced-motion`
- [x] Breakpoints 820 / 960 / 640 y ajustes para móviles bajos
- [x] Panel de administración

---

## 13. Auditoría final de la implementación (2026-11-05)

Verificado en el navegador integrado (Chromium) a 320×640, 375×812 y 1280×800, más 17 pruebas automatizadas (`npm test`, todas en verde).

| Área | Resultado |
|---|---|
| Portada, secciones y orden | Igual a la referencia: Hero → Equipo → El espacio → Instagram → Gift card → Cierre → Pie |
| Categorías desde datos | Los botones de la portada y las pantallas se generan desde la base; agregar/ocultar/ordenar categorías no requiere tocar código |
| Lista + detalle | Móvil: bottom-sheet con ruta propia, cierre con ✕, fondo, Esc y atrás del navegador. Escritorio (≥960 px): vista previa al costado con hover/foco/click |
| Botón atrás | Recorre el camino inverso: datos → horarios → calendario → detalle → lista → portada. Con enlace directo, no saca a la persona del sitio |
| Reserva | Calendario con días disponibles reales, selector de profesional, horarios, "Seleccionar", formulario, validación por campo, confirmación con código |
| Concurrencia | 20 solicitudes simultáneas por el mismo horario → 1 confirmada, 19 rechazadas (409) |
| Desbordes horizontales | Ninguno en 320 y 375 px (portada, lista, sheet, calendario, horarios, formulario) |
| Consola del navegador | Sin errores ni advertencias |
| Movimiento reducido | Todas las animaciones se desactivan con `prefers-reduced-motion` |
| Peso | Sin frameworks; dos familias de Google Fonts con display=swap; HTML con catálogo embebido (una sola solicitud para pintar) |

### Diferencias con la referencia (justificadas)

1. **Reserva dentro del sitio** en lugar de abrir el widget de LeadConnector en otra pestaña: en el navegador de Instagram una pestaña nueva saca a la clienta de la experiencia. La secuencia y los campos son los mismos.
2. **Sin la pregunta "Sesión" (radio)** del formulario: en la referencia existe porque un calendario agrupa varios tratamientos; acá el tratamiento ya viene elegido.
3. **Fecha de nacimiento con máscara DD/MM/AAAA** en lugar de selector de calendario: más rápido de completar en el celular.
4. **Tipografía:** Cormorant Garamond (titulares) + Jost (textos), según la referencia visual que pidió la clienta; misma lógica serif + sans que la referencia, con identidad propia.
5. **No se reprodujeron bugs de la referencia:** 404 de `/primer-paso`, precio distinto entre tarjeta y modal, comportamiento inconsistente de Esc y de apertura en pestaña nueva.
6. **Pantalla de confirmación:** diseño propio, porque la de la referencia no pudo verificarse sin crear una reserva real.
7. **Cancelación/reprogramación:** desde el panel (la referencia no mostró un mecanismo para la clienta); la confirmación indica escribir por WhatsApp con el código.
8. **Seña:** se muestra como texto configurable, igual que en el widget observado. No hay cobro online (no se verificó en la referencia y el proyecto excluye ecommerce).

### Pendiente de verificar fuera de este entorno

- Navegador interno de Instagram en iPhone y Android reales (probado en Chromium con emulación móvil).
- Envío real de mails (requiere credenciales SMTP en `.env`).
- Lectores de pantalla (se aplicaron roles, etiquetas y manejo de foco, sin prueba con VoiceOver/TalkBack).

### Ajustes de contenido pedidos (2026-11-05)

- Una sola cosmetóloga: la sección pasa de “Equipo” (3 personas) a “Tu cosmetóloga” con un retrato único. El selector de profesional del flujo de reserva se oculta solo, porque hay una sola persona reservable.
- Se quitó la categoría “Higiene de espalda” (botón de la portada, pantalla y tratamiento).
- Se quitó el aviso de “contenido de demostración”.
