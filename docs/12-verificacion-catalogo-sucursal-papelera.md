# Verificar catálogo, sucursal, carrito y papelera

Desde la raíz del proyecto, reconstruye y arranca la API con las migraciones nuevas. Conserva el volumen de PostgreSQL; estas migraciones no reinician datos.

```sh
sudo docker compose -f compose.dev.yaml build migrate api
sudo docker compose -f compose.dev.yaml run --rm migrate
sudo docker compose -f compose.dev.yaml up -d --no-deps --force-recreate api
sudo docker compose -f compose.dev.yaml exec -T database psql -U xpander -d xpander -c 'SELECT version,name FROM schema_migrations WHERE version >= 14 ORDER BY version;'
```

La consulta debe mostrar las migraciones 014 a 017. Inicia Next con `npm run dev` si aún no está abierto.

## 1. Estilos y público

1. En `/admin/catalogo/valores`, registra `CASUAL` como estilo y `MUJERES` como público. Repite cada nombre con espacios o minúsculas: la API debe indicar que ya existe. Las marcas se administran en la misma pantalla.
2. Abre `/admin/catalogo/productos` y comprueba que ambos aparecen como opciones. Crea una ficha con ellos.
3. Filtra por `CASUAL` en `/catalogo` y comprueba que aparece la ficha. Cambia `CASUAL` a `DEPORTIVA` en el apartado de estilos. La ficha, el filtro y el catálogo público deben mostrar el nuevo nombre.
4. Elimina `MUJERES`. El panel debe advertir cuántos productos están asociados. Tras confirmar, esos productos permanecen y su público queda vacío.

## 2. Carrito

1. Añade una variante con stock al carrito y registra un pedido. El comprobante y su enlace de WhatsApp deben quedar visibles, mientras el botón flotante muestra `Carrito · 0`.
2. Cierra y vuelve a abrir el carrito: el comprobante sigue visible durante esa sesión. Recarga `/catalogo`: el carrito continúa vacío.
3. Si la API rechaza el pedido, el carrito debe conservar sus unidades para que puedas corregirlo y reintentar.

## 3. Sucursal activa

1. En `/admin/sucursales`, cambia el nombre, la dirección y las indicaciones de recojo de la sucursal activa.
2. Abre el carrito: la selección de sucursal debe mostrar el nombre y la dirección nuevos, y debajo las indicaciones. Registra un pedido nuevo y comprueba que guarda estos datos.
3. Los pedidos creados antes de la edición deben conservar el nombre y la dirección anteriores como copia histórica.

## 4. Papelera

1. Crea un producto de prueba con una variante y una entrada de inventario, **sin crear pedidos para él**. Envíalo a la papelera y pulsa **Eliminar definitivamente**. Tras confirmar en el modal, debe desaparecer del catálogo, de la papelera y del inventario. Sus movimientos de prueba también se eliminan.
2. Envía a la papelera un producto que **sí** aparece en un pedido. La eliminación definitiva debe mostrar un bloqueo por historial de pedidos; el pedido permanece intacto.
3. Sube una imagen de prueba y asóciala a una ficha. Envíala a la papelera y elimínala definitivamente: se retira de la ficha y del banco. Si aparece en una publicación histórica, la versión sigue existiendo y muestra «Imagen eliminada». Si era la publicación pública actual, el marcador aparece allí de inmediato. El archivo deja de servirse.
4. Envía una sección de borrador a la papelera y elimínala definitivamente. Comprueba que desaparece de la lista. El botón **Vaciar papelera** usa las mismas reglas y cuenta los elementos bloqueados.

Si una acción falla, copia el mensaje del panel y consulta `sudo docker compose -f compose.dev.yaml logs --tail=100 api`. No uses el comando de reinicio de datos para estas pruebas.

## 5. Contacto, mapa y QR

1. En `/admin/contenido`, agrega o edita una sección **Contacto**. Completa Instagram y otro enlace social HTTPS, el enlace para abrir la ubicación de Google Maps y la URL `src` del mapa insertable. Guarda el borrador. La landing pública todavía debe conservar la versión anterior; la vista previa ya muestra iconos y mapa.
2. Pulsa **Publicar**. La landing pública debe mostrar solo los enlaces completados. Al pulsar el mapa se abre la ubicación en una pestaña nueva.
3. En `/admin/negocio`, cambia el teléfono y una red social; sube o selecciona una imagen PNG/JPEG para el QR y guarda. Recarga: los valores se mantienen. Abre `/api/business` y comprueba que devuelve el teléfono, la red y una `qrUrl` pública. El QR público debe abrirse; al quitar el QR y guardar, `qrMediaId` queda vacío.
4. Vuelve a activar un QR, envía esa imagen a la papelera y elimínala definitivamente. La configuración del negocio debe perder la referencia al QR y la URL antigua debe responder 404.

La imagen del QR queda preparada para el futuro flujo de transferencia. Subirla por sí solo no registra comprobantes ni confirma pagos.
