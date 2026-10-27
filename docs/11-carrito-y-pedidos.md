# Carrito, pedidos por WhatsApp y pago por QR

## Flujo del cliente

1. El cliente agrega variantes desde `/catalogo` (botón «+» de cada tarjeta, con selector de talla) o desde la ficha `/catalogo/[slug]`. El carrito se conserva en el navegador (`xpander_cart_v1`).
2. El botón flotante del carrito (abajo a la derecha) o el ícono del encabezado abre un panel lateral con el total por producto. `/carrito` muestra el mismo flujo a pantalla completa.
3. **Finalizar pedido** solicita nombre, celular, indicaciones opcionales, la forma de entrega, la sucursal y cómo continuar:
   - **Recojo en sucursal**: sin costo.
   - **Envío a domicilio**: la sucursal elegida es la que despacha y de la que se descontará el stock. La dirección y el costo del envío se coordinan por WhatsApp y se pagan aparte; el QR cubre solo los productos.
   - **Coordinar por WhatsApp**: registra un pedido pendiente (`payment_method = whatsapp`, `payment_status = not_required`) y muestra el mensaje para enviarlo al negocio. No requiere QR ni comprobante.
   - **Pagar con QR**: disponible cuando hay un QR vigente. Registra un pedido pendiente (`payment_method = qr`, `payment_status = awaiting_receipt`) y muestra el QR y el campo para adjuntar comprobante.
4. Al registrar cualquiera de los dos tipos de pedido, el carrito se vacía y el pedido ya no se modifica. Para QR, **Enviar comprobante y continuar** sube un archivo PNG, JPEG o PDF de hasta 8 MB.
5. **Enviar detalle por WhatsApp** abre el mensaje para `ORDER_WHATSAPP_NUMBER`. Abrir WhatsApp no prueba que el mensaje se envió; el pedido ya está guardado en el sistema. En el flujo QR también queda guardado el comprobante.
6. El navegador recuerda los pedidos QR con pago en seguimiento; al volver a abrir el carrito vacío se retoma el último y el cliente puede consultar su estado.

Si no hay un QR vigente, la opción QR queda deshabilitada, pero se puede registrar el pedido por WhatsApp. El panel de administración muestra una alerta cuando falta el QR o cuando le quedan 7 días o menos.

## Flujo del administrador

En `/admin/pedidos`, los pedidos por WhatsApp se confirman después de coordinar con el cliente. Para los pedidos QR, el dueño descarga el comprobante, verifica el abono real en su banca y pulsa **Aprobar pago y descontar stock**: la interfaz verifica el pago y luego confirma el pedido, registrando una salida por ítem en la sucursal del pedido. Si el stock ya no alcanza, el pago queda verificado y el pedido sigue pendiente hasta reponer el inventario y pulsar **Confirmar y descontar inventario**. **Rechazar comprobante** permite que el cliente suba otro.

**Cancelar pedido** está disponible para pedidos pendientes y no descuenta inventario. Si el pago ya fue verificado, la API solo permite cancelar cuando la sucursal del pedido no tiene stock suficiente y el dueño confirma que devolverá el dinero al cliente por su cuenta (`?refundAcknowledged=1`). Las confirmaciones del panel usan modales que muestran las unidades que se descontarán.

El catálogo público indica en qué sucursales activas hay al menos una unidad de cada talla, sin mostrar la cantidad. Los productos sin existencias siguen visibles con la etiqueta «Sin existencias», sus tallas agotadas no se pueden agregar y el carrito bloquea la compra si una talla no está disponible en la sucursal elegida. Las sucursales se crean y editan en `/admin/sucursales`.

El pedido pendiente **no reserva stock**. El servidor comprueba precios y existencias al registrarlo y de nuevo al confirmarlo, dentro de una transacción. El pedido conserva nombre, talla, código, precio, sucursal y forma de entrega como copia histórica.

## Aplicar las migraciones y reconstruir la API

Desde la raíz del proyecto, con Docker en funcionamiento, reconstruye el migrador y la API, aplica las migraciones pendientes y recrea la API:

```sh
sudo docker compose -f compose.dev.yaml up -d database
sudo docker compose -f compose.dev.yaml build migrate api
sudo docker compose -f compose.dev.yaml run --rm migrate
sudo docker compose -f compose.dev.yaml up -d --no-deps --force-recreate api
sudo docker compose -f compose.dev.yaml ps
sudo docker compose -f compose.dev.yaml exec -T database psql -U xpander -d xpander -c 'SELECT version, name FROM schema_migrations WHERE version BETWEEN 21 AND 23 ORDER BY version;'
```

La última consulta debe mostrar `021_image_derivatives.sql`, `022_order_delivery_cancel.sql` y `023_store_sales.sql`. El migrador puede indicar `newly_applied=0` si ya estaban aplicadas. No uses `down -v`: borraría la base y las imágenes del entorno local. Para probar los cambios de interfaz, reinicia Next si su servidor de desarrollo no los detectó.

## Prueba local completa

1. En `/admin/negocio`, carga un QR de prueba con su vencimiento. En `/admin/catalogo/productos`, crea un producto **activo** con una variante, precio y una entrada inicial de **3 unidades** en una sucursal.
2. En `/catalogo`, agrega **2 unidades** de esa variante, abre el carrito y pulsa **Finalizar pedido**. Completa los datos, elige **Recojo en sucursal**, la misma sucursal y **Pagar con QR**; después pulsa **Continuar con el pago**.
3. Comprueba que aparece un número `XP-...` con el QR. Adjunta un comprobante de prueba y pulsa **Enviar comprobante y continuar**; luego abre el enlace de WhatsApp. El pedido debe aparecer como **Comprobante por revisar** en `/admin/pedidos` y el saldo seguir en 3.
4. Pulsa **Aprobar pago y descontar stock** (solo en una prueba sin dinero real). El pedido debe pasar a **Confirmado** y el saldo de `/admin/inventario` a **1**; en movimientos debe aparecer una venta de **−2**.
5. Intenta solicitar 2 unidades más de la misma variante y sucursal. El servidor debe rechazar la solicitud por falta de stock y no crear otro pedido.

Para comprobar el camino sin QR, usa otra variante con existencias, elige **Coordinar por WhatsApp** y pulsa **Registrar pedido**. Debe aparecer el enlace con el detalle, el carrito debe quedar en cero y el pedido debe figurar como pendiente en `/admin/pedidos`. Confírmalo desde el panel y revisa que el stock se descuente una sola vez. Repite con el QR vencido: la opción QR debe quedar inhabilitada y WhatsApp debe seguir disponible.

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

## Ventas en tienda

En `/admin/vender` el dueño registra las ventas hechas en el local. Elige la sucursal, toca las tallas vendidas (solo las que tienen stock en esa sucursal), indica la forma de pago (efectivo, QR o tarjeta) y, si corresponde, un descuento, el cliente y una nota.

`POST /api/admin/sales` guarda la venta como pedido `confirmed` con `channel = 'store'` y `payment_status = 'verified'`, y registra una salida `sale` por producto en la misma transacción. Si el stock no alcanza no se guarda nada. La petición lleva un `requestKey`, así que un reintento devuelve la misma venta y no la duplica. Los precios salen del catálogo en el servidor; el descuento no puede superar el subtotal. Sin nombre se guarda «Cliente en tienda» y sin celular «Sin registrar».

Estas ventas aparecen en Pedidos (filtro «Ventas en tienda»), en los movimientos de inventario y en las ventas confirmadas del Resumen. No envían WhatsApp ni piden comprobante. Migración: `023_store_sales.sql`.
