# Buzón de sugerencias, variantes de portada y videos

## Buzón de sugerencias

La migración `026_suggestions.sql` crea la tabla `suggestions` con nombre, celular de 8 dígitos sin código de país, mensaje y estado (`pending` o `done`).

- **En la página:** el buzón es una sección de la landing (`suggestions`). El editor la agrupa en **Pie de página** y la página de inicio la muestra justo encima del pie, sin importar su posición en el borrador. Su título y su texto se editan como en cualquier sección, y se puede ocultar.
- **Envío:** `POST /api/suggestions` exige el mismo origen que el sitio. Acepta el celular con espacios, guiones o un `+591` pegado y lo guarda con 8 dígitos que empiezan con 6 o 7. Admite 5 envíos por IP cada 15 minutos. Si alguien llena el campo oculto `website`, que suelen llenar los robots, la API responde como si lo hubiera guardado, pero no lo guarda.
- **En el panel:** **Sugerencias** (`/admin/sugerencias`) muestra las pendientes primero, con búsqueda y un enlace para responder por WhatsApp. Cada sugerencia se marca como atendida, se devuelve a pendiente o se elimina definitivamente, sin pasar por la Papelera. «Copiar pendientes» copia la lista en texto para llevarla a la compra. El menú muestra cuántas hay pendientes. Las rutas de administración (`GET`, `PATCH` y `DELETE` en `/api/admin/suggestions`) son solo para el propietario.

## Celulares sin código de país

Los formularios piden el celular con 8 dígitos y sin `+591`: el checkout, el buzón, la venta en tienda y el teléfono de Datos del negocio. Si se pega un número con el código de país, el formulario lo quita. Los enlaces de WhatsApp le agregan el `591` por dentro. `ORDER_WHATSAPP_NUMBER`, en el `.env`, se mantiene con el código de país porque WhatsApp lo exige; ese número no aparece en la interfaz.

## Variantes de portada

La configuración de cada portada se guarda en `page_sections.config` y llega a la publicación como `hero`. Las portadas guardadas antes de esta versión se leen como «Clásica».

| Variante | Diseño | En el celular |
| --- | --- | --- |
| `classic` · Clásica | Texto a un lado e imagen o video 4:5 al otro. | Imagen arriba, texto debajo. |
| `cover` · Fondo completo | La imagen o el video cubre toda la franja, con una capa negra encima. | Ocupa casi toda la pantalla y el texto va abajo. |
| `split` · Pantalla dividida | Mitad texto, mitad imagen hasta el borde. | Imagen 4:5 arriba, texto debajo. |
| `centered` · Centrada | Título centrado y una franja panorámica 21:9 debajo. | La franja pasa a 4:5. |

Opciones: el tamaño del título (S, M, L o XL) y mostrar u ocultar los botones de compra, en todas; el opacamiento de 0 a 85 % y la posición del texto (abajo o centrado), en «Fondo completo»; la altura (pantalla completa o media), en «Fondo completo» y «Pantalla dividida». El editor incluye una vista rápida de la portada a la mitad de su tamaño.

## Videos subidos

- **Dónde se usan:** en la portada, la Galería y los Bloques de imágenes. La API rechaza un video en cualquier otra sección y en las fichas de producto.
- **Límites:** 5 videos guardados como máximo, contando los de la Papelera (para subir otro hay que eliminar uno definitivamente). Cada uno dura hasta 30 segundos y pesa hasta 100 MB al subirlo. Se aceptan MP4, MOV y WebM. El navegador revisa la duración y el peso antes de subir, y el servidor vuelve a comprobarlos.
- **Proceso:** `POST /api/admin/media/videos` guarda el archivo en disco mientras llega. ffmpeg lo convierte a MP4 H.264 de 1920 px como máximo en su lado mayor, 30 cuadros por segundo y sin audio, con el índice al inicio para que empiece a reproducirse antes de descargarse completo. Ocupa unos 5 a 15 MB. Del primer cuadro salen imágenes de portada en WebP (`thumb`, `card` y `detail`), que el panel usa como miniaturas. ffmpeg solo lee los formatos MP4/MOV y Matroska/WebM, y únicamente archivos locales. Se procesa un video a la vez, con 2 hilos, para no frenar al resto del VPS.
- **Almacenamiento:** el video y sus imágenes de portada cuentan para el límite `MEDIA_QUOTA_GB` y entran en los respaldos de `deploy/backup.sh` junto con las imágenes.
- **Reproducción:** silenciada, en bucle y sin controles, solo mientras el video está en pantalla. Con «reducir movimiento» activado en el dispositivo, se muestra la imagen fija. Se sirve con `http.ServeFile`, que admite las peticiones por rangos que usan Safari y los celulares.
- **Caddy:** el bloque de XPANDER admite 110 MB solo en `/api/admin/media/videos` y mantiene 12 MB en el resto. Ver [despliegue](15-despliegue.md#actualizar-a-una-nueva-versión).

## Créditos

La última línea del pie muestra «© 2026 XPANDER · Bolivia», el enlace a Privacidad y «Diseño y desarrollo web» con el nombre y el enlace del autor, definidos en `app/site-credits.ts`. También se publican como autor en los metadatos de la página. No se editan desde el panel.
