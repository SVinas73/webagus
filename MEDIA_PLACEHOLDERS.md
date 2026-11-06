# MEDIA_PLACEHOLDERS.md — Inventario de recursos multimedia

El sitio **no usa ninguna foto, video ni logo de la referencia** ni imágenes de stock. Cada lugar donde va un recurso muestra un marcador del tipo:

```
[FOTO: Retrato de Profesional B]
foto-profesional-b.webp
```

## Cómo reemplazar un marcador

**Opción A — Panel (recomendada):** `/admin` → **Multimedia**. Cada tarjeta indica para qué es el archivo, si falta o ya está cargado, y tiene un botón **Subir/Reemplazar**. El archivo se guarda con el nombre correcto y la web lo muestra al instante.

**Opción B — Carpeta:** copiá el archivo en `public/media/` con **exactamente** el nombre de la tabla. La web lo detecta sola (sin reiniciar).

Los nombres se pueden cambiar desde el panel (cada tratamiento, categoría, profesional y sección tiene su campo "archivo"); esta tabla refleja el contenido de demostración inicial.

### Recomendaciones generales
- **Fotos:** `.webp` (calidad 80), sRGB. Exportá al doble del tamaño visible para pantallas retina; las medidas de abajo ya lo contemplan.
- **Videos:** `.mp4` H.264, sin audio (se reproducen silenciados), 6–12 s en loop, ≤ 8 MB cada uno. Siempre con una **portada** `.webp` con la misma proporción (se ve mientras carga y en celulares que bloquean el autoplay).
- Todas las imágenes se recortan con `object-fit: cover` centrado: dejá el sujeto en el centro y aire alrededor.
- Peso orientativo: fotos ≤ 300 KB, portadas ≤ 150 KB. El sitio se abre mucho desde el navegador de Instagram con datos móviles.

---

## 1. Identidad

| Identificador | Archivo | Ubicación | Dimensiones | Proporción | Contenido | Transparencia |
|---|---|---|---|---|---|---|
| Logo | `logo-centro.svg` (o `logo-centro.png`) | Círculo central de la portada (150–180 px) y cabecera del flujo de reserva (52 px) | SVG vectorial; PNG 800×800 | 1:1 (el logo ocupa ~72 % del círculo) | Logotipo del centro en color oscuro `#2C3027` u oliva `#68764B` (se apoya sobre el verde `#C8D890`) | **Sí** |
| Portada (opcional) | `foto-portada.webp` | Fondo de la portada, detrás del logo y los botones, con velo verde al 62 % | 2000×2000 | 1:1 (se recorta a vertical en celular y horizontal en computadora) | Textura o escena serena: crema sobre la piel, manos, detalle del espacio. Evitar rostros en el centro (quedan detrás de los botones) | No |

## 2. Cabeceras de categoría

Fondo de la cabecera de cada pantalla de categoría, con velo verde encima.

| Identificador | Archivo | Dimensiones | Proporción | Contenido | Transp. |
|---|---|---|---|---|---|
| Sesiones faciales | `foto-categoria-facial.webp` | 2000×750 | 8:3 | Rostro en tratamiento, plano cerrado y luminoso | No |
| Masaje facial | `foto-categoria-masaje.webp` | 2000×750 | 8:3 | Manos realizando masaje facial | No |

## 3. Tratamientos

Cada foto se usa en tres lugares: miniatura circular de la lista (64–72 px), cabecera del detalle en el celular (≈560×210) y cabecera de la tarjeta de detalle en la computadora (≈700×150).

| Tratamiento | Archivo | Dimensiones | Proporción | Contenido sugerido | Transp. |
|---|---|---|---|---|---|
| Evaluación y facial a medida | `foto-tratamiento-evaluacion.webp` | 1200×800 | 3:2 | Profesional evaluando la piel con lupa/luz | No |
| Limpieza facial profunda | `foto-tratamiento-limpieza.webp` | 1200×800 | 3:2 | Limpieza con vapor o extracción | No |
| Peeling + hidratación | `foto-tratamiento-peeling.webp` | 1200×800 | 3:2 | Aplicación de peeling con pincel | No |
| Dermaplaning y renovación | `foto-tratamiento-dermaplaning.webp` | 1200×800 | 3:2 | Dermaplaning en mejilla | No |
| Microneedling con activos | `foto-tratamiento-microneedling.webp` | 1200×800 | 3:2 | Dermapen en uso | No |
| Facial antioxidante | `foto-tratamiento-antioxidante.webp` | 1200×800 | 3:2 | Sérum/máscara de hidrogel | No |
| Gift card / cuponera | `foto-tratamiento-gift-card.webp` | 1200×800 | 3:2 | Gift card sobre superficie clara | No |
| Masaje facial | `foto-tratamiento-masaje-facial.webp` | 1200×800 | 3:2 | Masaje con las manos | No |

> Para la miniatura circular conviene que el detalle principal quede en el centro exacto de la foto.

## 4. Tu cosmetóloga

El sitio muestra **una sola profesional**. En la web el marcador dice solo “Retrato cosmetóloga”.

| Identificador | Archivo | Ubicación | Dimensiones | Proporción | Contenido | Transp. |
|---|---|---|---|---|---|---|
| Retrato cosmetóloga | `foto-cosmetologa.webp` | Sección “Tu cosmetóloga”, retrato único centrado (marco con arco superior) | 1020×1360 | 3:4 | Retrato de medio cuerpo, fondo neutro claro, mirada a cámara | No |

> Dejá espacio sobre la cabeza: el marco redondea la parte superior.

## 5. El espacio (carrusel)

| Identificador | Archivo | Dimensiones | Proporción | Contenido | Transp. |
|---|---|---|---|---|---|
| Video espacio 1 | `video-espacio-01.mp4` + `video-espacio-01-portada.webp` | 1080×1440 | 3:4 | Recorrido lento por la sala de tratamientos | No |
| Video espacio 2 | `video-espacio-02.mp4` + `video-espacio-02-portada.webp` | 1080×1440 | 3:4 | Detalle de camilla y aparatología | No |
| Foto espacio 1 | `foto-espacio-01.webp` | 900×1200 | 3:4 | Sala de tratamientos con luz natural | No |
| Foto espacio 2 | `foto-espacio-02.webp` | 900×1200 | 3:4 | Recepción y zona de espera | No |
| Foto espacio 3 | `foto-espacio-03.webp` | 900×1200 | 3:4 | Productos y activos en estantería | No |
| Foto espacio 4 | `foto-espacio-04.webp` | 900×1200 | 3:4 | Detalle de texturas (cremas, sérums) | No |
| Foto espacio 5 | `foto-espacio-05.webp` | 900×1200 | 3:4 | Profesional preparando la sesión | No |

Se pueden agregar o quitar elementos en `/admin` → Textos del sitio → El espacio.

## 6. Instagram

Tarjetas verticales que abren la publicación en Instagram (o un video propio si el enlace termina en `.mp4`). Si la lista queda vacía, la sección se oculta.

| Identificador | Archivo | Dimensiones | Proporción | Contenido | Transp. |
|---|---|---|---|---|---|
| Portada 1–4 | `foto-instagram-01.webp` … `foto-instagram-04.webp` | 1080×1920 | 9:16 | Primer cuadro del reel correspondiente | No |

## 7. Gift card

| Identificador | Archivo | Dimensiones | Proporción | Contenido | Transp. |
|---|---|---|---|---|---|
| Gift card | `foto-gift-card.webp` | 800×1200 | 2:3 | Diseño de la gift card (se muestra levemente girada) | Opcional (PNG/WebP con transparencia si querés que flote) |

## 8. Cierre (videos de sesiones)

| Identificador | Archivo | Dimensiones | Proporción | Contenido | Transp. |
|---|---|---|---|---|---|
| Video sesión 1 | `video-sesion-01.mp4` + `video-sesion-01-portada.webp` | 1080×1920 | 9:16 | Aplicación de máscara facial | No |
| Video sesión 2 | `video-sesion-02.mp4` + `video-sesion-02-portada.webp` | 1080×1920 | 9:16 | Masaje facial en cámara lenta | No |
| Video sesión 3 | `video-sesion-03.mp4` + `video-sesion-03-portada.webp` | 1080×1920 | 9:16 | Textura de sérum sobre la piel | No |

---

**Total inicial:** 33 archivos (el panel muestra el progreso: "X de 33 archivos cargados").
