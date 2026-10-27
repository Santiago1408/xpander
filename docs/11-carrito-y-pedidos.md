# Carrito y pedidos para recojo

El cliente añade variantes desde `/catalogo`. El carrito se conserva en el navegador y muestra cantidades y un total estimado en bolivianos. Para solicitar el recojo, elige una sucursal activa e ingresa nombre y teléfono. El servidor vuelve a comprobar que las variantes estén publicadas, que sus precios no hayan cambiado y que exista stock suficiente en esa sucursal. El pedido se guarda como **pendiente** antes de mostrar el enlace a WhatsApp `59170782380`.

Abrir WhatsApp solo prepara el mensaje: el cliente aún debe pulsar **Enviar**. El sistema no puede saber si lo envió o si el dueño lo recibió. La lista de `/admin/pedidos` muestra todos los pedidos guardados, incluso cuando el cliente cierra WhatsApp. La clave de solicitud evita duplicar un pedido si se reintenta la misma operación desde el mismo formulario.

El pedido pendiente **no reserva stock**. Al pulsar **Confirmar y descontar inventario**, la API bloquea el pedido, registra una salida por ítem y cambia su estado a confirmado dentro de una transacción. Si el saldo ya no alcanza, no descuenta ninguna unidad ni confirma el pedido; el dueño deberá reponer o corregir el inventario antes de volver a intentar. Una segunda confirmación no crea salidas adicionales. El pedido conserva nombre, talla, código, precio y sucursal como copia histórica.

## Aplicar la corrección de salidas de stock

Desde la raíz del proyecto, con Docker en funcionamiento, reconstruye el migrador y la API, aplica explícitamente la migración `013` y recrea la API:

```sh
sudo docker compose -f compose.dev.yaml build migrate api
sudo docker compose -f compose.dev.yaml run --rm migrate
sudo docker compose -f compose.dev.yaml up -d --no-deps --force-recreate api
sudo docker compose -f compose.dev.yaml ps
sudo docker compose -f compose.dev.yaml exec -T database psql -U xpander -d xpander -c 'SELECT version, name FROM schema_migrations WHERE version IN (12, 13) ORDER BY version;'
```

La última consulta debe mostrar `012_order_requests.sql` y `013_stock_outflow.sql`. El migrador puede indicar `newly_applied=0` si la `013` ya estaba aplicada. No uses `down -v`: borraría la base y las imágenes del entorno local. Si Next ya está ejecutándose con `npm run dev`, déjalo abierto; esta corrección está en PostgreSQL, no en el navegador.

## Prueba local completa

1. En `/admin/catalogo/productos`, crea un producto de prueba **activo**, con una variante, precio de venta y una entrada inicial de **3 unidades** en una sucursal concreta. Comprueba en `/admin/inventario` que el saldo sea 3 en esa sucursal.
2. En `/catalogo`, agrega **2 unidades** de esa variante. Abre el carrito, elige **la misma sucursal**, ingresa nombre y teléfono de prueba y pulsa **Registrar pedido**.
3. Comprueba que aparece un número `XP-...` y un enlace a WhatsApp con las 2 unidades. Aunque cierres WhatsApp, el pedido debe seguir **Pendiente** en `/admin/pedidos`; el saldo debe continuar en 3.
4. Pulsa **Confirmar y descontar inventario**. El pedido debe pasar a **Confirmado** y el saldo de `/admin/inventario` a **1**; en movimientos debe aparecer una venta de **−2**. Recarga ambas páginas: el saldo y el número de salidas deben permanecer iguales.
5. Intenta solicitar 2 unidades más de la misma variante y sucursal. El servidor debe rechazar la solicitud por falta de stock y no crear otro pedido.

Un pedido que quedó pendiente antes de aplicar la `013` puede confirmarse después sin registrarlo otra vez, siempre que el stock de su sucursal siga siendo suficiente. Si aún falla, revisa el mensaje rojo del panel y ejecuta:

```sh
sudo docker compose -f compose.dev.yaml logs --tail=100 api
sudo docker compose -f compose.dev.yaml logs --tail=100 migrate
```

Para comparar pedido y saldos sin modificar datos, consulta las últimas solicitudes pendientes:

```sh
sudo docker compose -f compose.dev.yaml exec -T database psql -U xpander -d xpander -c "SELECT o.id, o.status, b.name AS sucursal, oi.product_name, oi.variant_label, oi.quantity AS solicitado, COALESCE(s.quantity, 0) AS disponible FROM orders o JOIN branches b ON b.id=o.pickup_branch_id JOIN order_items oi ON oi.order_id=o.id LEFT JOIN branch_stock s ON s.branch_id=o.pickup_branch_id AND s.variant_id=oi.variant_id WHERE o.status='pending' ORDER BY o.id DESC, oi.id LIMIT 20;"
```

La cantidad disponible debe ser al menos la solicitada **para cada línea en la sucursal del pedido**. Si no lo es, la confirmación se rechazará correctamente.

Los estados del pedido siguen siendo **pendiente** y **confirmado**. El pago por QR tiene estados separados; un pedido QR requiere un abono verificado manualmente antes de confirmarse. Consulta [inventario y QR](09-inventario-y-qr.md).
