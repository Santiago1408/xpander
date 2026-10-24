# Productos, variantes y catálogo público

La migración `007_product_revision.sql` añade `products.revision` para rechazar guardados realizados desde una ficha desactualizada. No crea productos ni modifica precios existentes.

## Panel de productos

Desde `/admin/catalogo/productos`, el propietario puede crear y editar fichas. Cada producto tiene categoría, marca opcional, nombre, descripción, atributos de producto, estado (`draft`, `active` o `archived`), indicador de destacado y hasta 12 imágenes. Las imágenes usan el mismo volumen persistente `media_data` del editor de la landing.

Cada variante tiene un SKU único, precio de venta en bolivianos y una combinación de opciones de atributos de variante. El formulario convierte el precio a centavos enteros y la API valida el entero recibido; rechaza combinaciones duplicadas y exige que todas las variantes de un producto utilicen el mismo conjunto de atributos. Una ficha activa necesita al menos una variante activa con precio mayor a cero. El administrador puede añadir variantes y cambiar precios o estado activo de las existentes. Para conservar referencias de inventario y pedidos futuros, el SKU y la combinación de una variante existente quedan fijos: se crea una nueva variante y se desactiva la anterior si hay que corregirlos.

Los productos se guardan en una transacción. La API comprueba el rol `owner`, el origen de las escrituras y la revisión vigente antes de modificar el producto. No permite omitir variantes existentes del formulario; se desactivan en lugar de borrarlas. Las categorías, marcas y opciones nuevas deben estar activas; las ya asociadas pueden mantenerse aunque después se desactiven en el vocabulario.

## Catálogo público

`/catalogo` muestra solo fichas `active` con al menos una variante activa. Presenta categoría, marca, descripción, características, imágenes, variantes y precio en BOB. Los borradores y archivados no aparecen. La primera imagen de la ficha es la principal; su URL pública solo es accesible mientras esté asociada a un producto activo o a una publicación de la landing.

El catálogo no muestra existencias todavía. La disponibilidad debe confirmarse en la tienda hasta que estén implementados el inventario y el carrito. No hay botón para generar pedidos en esta etapa.

## Prueba local

1. Reconstruye la API y aplica la migración: `sudo docker compose -f compose.dev.yaml up --build -d`.
2. Inicia Next con `npm run dev` y entra como propietario.
3. En `/admin/catalogo/vocabulario`, crea una categoría y, si quieres, un atributo de variante con dos opciones.
4. En `/admin/catalogo/productos`, crea una ficha en borrador con un SKU y precio. Comprueba que no aparezca en `/catalogo`.
5. Cambia su estado a **Activo**, guarda y actualiza `/catalogo`. Debe aparecer con su precio. Sube una imagen y guarda de nuevo para verla allí.
6. Añade otra variante con una combinación distinta. Intenta repetir la combinación: la API debe rechazarla. Desactiva la ficha y comprueba que desaparezca del catálogo público.

Antes de almacenar mercancía real, el siguiente paso será registrar movimientos de inventario por sucursal y variante. Después se conectará el carrito con los pedidos persistentes y WhatsApp.
