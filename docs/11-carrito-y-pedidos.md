# Carrito, pago por QR y pedidos

## Flujo del cliente

1. El cliente agrega variantes desde `/catalogo` (botón «+» de cada tarjeta, con selector de talla) o desde la ficha `/catalogo/[slug]`. El carrito se conserva en el navegador (`xpander_cart_v1`).
2. El botón flotante del carrito (abajo a la derecha) o el ícono del encabezado abre un panel lateral con el total por producto y el total a pagar. `/carrito` muestra el mismo flujo a pantalla completa.
3. **Finalizar compra** solicita nombre, celular, indicaciones opcionales, la forma de entrega y la sucursal:
   - **Recojo en sucursal**: sin costo.
   - **Envío a domicilio**: la sucursal elegida es la que despacha y de la que se descontará el stock. La dirección y el costo del envío se coordinan por WhatsApp y se pagan aparte; el QR cubre solo los productos.
4. **Continuar con el pago** registra el pedido como **pendiente** (`payment_method = qr`, `payment_status = awaiting_receipt`) y muestra el número `XP-…`, el QR vigente, los pasos para pagar y el campo para adjuntar el comprobante. Desde ese momento el carrito se vacía y el pedido ya no se modifica.
5. **Enviar comprobante y continuar** sube el archivo (PNG, JPEG o PDF de hasta 8 MB) y pasa al último paso: **Enviar detalle por WhatsApp** abre el mensaje para el número `ORDER_WHATSAPP_NUMBER`. Abrir WhatsApp no prueba que el mensaje se envió; el pedido y el comprobante ya están guardados.
6. El navegador recuerda los pedidos con pago en seguimiento; al volver a abrir el carrito vacío se retoma el último y el cliente puede consultar su estado.

Si no hay un QR vigente, el carrito no permite finalizar la compra y el panel de administración muestra una alerta en todas las pantallas. También avisa cuando al QR le quedan 7 días o menos.

## Flujo del administrador

En `/admin/pedidos`, el dueño descarga el comprobante, verifica el abono real en su banca y pulsa **Aprobar pago y descontar stock**: la interfaz verifica el pago y luego confirma el pedido, registrando una salida por ítem en la sucursal del pedido. Si el stock ya no alcanza, el pago queda verificado y el pedido sigue pendiente hasta reponer el inventario y pulsar **Confirmar y descontar inventario**. **Rechazar comprobante** permite que el cliente suba otro.

**Cancelar pedido** está disponible para pedidos pendientes cuyo pago no fue verificado (por ejemplo, abandonados sin comprobante). No descuenta inventario. Un pedido con pago verificado no se puede cancelar.

El pedido pendiente **no reserva stock**. El servidor comprueba precios y existencias al registrarlo y de nuevo al confirmarlo, dentro de una transacción. El pedido conserva nombre, talla, código, precio, sucursal y forma de entrega como copia histórica.

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

1. En `/admin/negocio`, carga un QR de prueba con su vencimiento. En `/admin/catalogo/productos`, crea un producto **activo** con una variante, precio y una entrada inicial de **3 unidades** en una sucursal.
2. En `/catalogo`, agrega **2 unidades** de esa variante, abre el carrito y pulsa **Finalizar compra**. Completa los datos, elige **Recojo en sucursal** y la misma sucursal, y pulsa **Continuar con el pago**.
3. Comprueba que aparece un número `XP-...` con el QR. Adjunta un comprobante de prueba y pulsa **Enviar comprobante y continuar**; luego abre el enlace de WhatsApp. El pedido debe aparecer como **Comprobante por revisar** en `/admin/pedidos` y el saldo seguir en 3.
4. Pulsa **Aprobar pago y descontar stock** (solo en una prueba sin dinero real). El pedido debe pasar a **Confirmado** y el saldo de `/admin/inventario` a **1**; en movimientos debe aparecer una venta de **−2**.
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
