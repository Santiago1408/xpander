# Procesamiento de imágenes

La migración `021_image_derivatives.sql` añade el propósito de cada imagen y registra sus versiones de tamaño. Las imágenes JPEG, PNG y WebP nuevas se procesan al subirlas desde el banco de medios, el producto o la landing. La API acepta archivos de hasta 8 MiB y 12 millones de píxeles, y rechaza imágenes animadas.

Las fotos se guardan como WebP: un archivo principal con lado máximo de 1920 píxeles y, cuando la fuente es mayor que cada límite, versiones `thumb` (320), `card` (800) y `detail` (1200). No se conserva el original grande. El navegador elige la versión según el espacio disponible usando `srcset` y `sizes`. Las fotos que existían antes de la migración siguen sirviéndose en JPEG o PNG; sus URL con `?size=` devuelven el archivo anterior hasta que se vuelvan a cargar.

El QR se sube desde `/admin/negocio` con propósito `qr`. Se guarda en PNG sin redimensionar ni aplicar compresión con pérdida; solo los QR aparecen en el selector de ese apartado. Los comprobantes de pago mantienen su carga y almacenamiento privados independientes.

El procesamiento utiliza ImageMagick en la imagen de desarrollo de la API, limita sus recursos y procesa una carga a la vez por instancia. La papelera mantiene los archivos. La eliminación definitiva y el comando de reinicio borran también las versiones WebP. Las imágenes públicas pueden permanecer hasta 60 segundos en la caché del navegador después de una eliminación; las privadas del administrador siguen sin caché.

## Aplicar y comprobar en local

```sh
sudo docker compose -f compose.dev.yaml up --build -d
sudo docker compose -f compose.dev.yaml logs migrate
sudo docker compose -f compose.dev.yaml exec -T database psql -U xpander -d xpander -c "SELECT version, name FROM schema_migrations WHERE version=21;"
```

En `/admin/medios`, sube una fotografía grande en JPEG y otra en WebP. Deben aparecer en el banco. Abre la pestaña de red del navegador: las tarjetas deben solicitar `?size=thumb` o `?size=card` y recibir `Content-Type: image/webp`. Revisa que la ficha de producto, los destacados y la landing muestren la misma imagen sin distorsión. En `/admin/negocio`, sube un QR y comprueba que se sirve como `image/png`, conserva sus dimensiones y es escaneable.

```sh
sudo docker compose -f compose.dev.yaml exec -T database psql -U xpander -d xpander -c "SELECT m.id, m.purpose, m.mime_type, m.file_size_bytes, v.size_key, v.width_px, v.height_px, v.file_size_bytes FROM media m LEFT JOIN media_variants v ON v.media_id=m.id ORDER BY m.id DESC, v.width_px;"
```

Envía una foto a la papelera y elimínala definitivamente. Sus filas en `media` y `media_variants` deben desaparecer. Para ver el volumen completo, incluidos archivos sin registro, usa `sudo docker compose -f compose.dev.yaml exec api du -sh /srv/media`.

La cuota total de 40 GB, el video del hero y el procesamiento retroactivo de archivos ya cargados son pasos posteriores. Antes de desplegar la API fuera de `compose.dev.yaml`, instala ImageMagick con soporte WebP en su imagen de producción y conserva el volumen de medios.
