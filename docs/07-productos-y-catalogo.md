# Productos, variantes y catálogo público

La migración `007_product_revision.sql` añade `products.revision` para rechazar guardados realizados desde una ficha desactualizada. No crea productos ni modifica precios existentes.

## Panel de productos

Desde `/admin/catalogo/productos`, el propietario puede crear y editar fichas. Cada producto tiene categoría, marca opcional, nombre, descripción, atributos de producto, estado (`draft`, `active` o `archived`), indicador de destacado y hasta 12 imágenes. Las imágenes usan el mismo volumen persistente `media_data` del editor de la landing.

El identificador del producto (`slug`) se sugiere desde el nombre y puede modificarse. Queda reservado para una futura dirección individual; por ahora las fichas se muestran como tarjetas en `/catalogo`. «Destacado» cambia el orden y muestra una etiqueta dentro de ese catálogo; todavía no inserta automáticamente el producto en la landing.

Cada variante tiene un SKU único generado por el servidor, precio de venta en bolivianos y una combinación de opciones de atributos de variante. El administrador no escribe ni modifica el SKU. El formulario convierte el precio a centavos enteros y la API valida el entero recibido; rechaza combinaciones duplicadas y exige que todas las variantes de un producto utilicen el mismo conjunto de atributos. Una ficha activa necesita al menos una variante activa con precio mayor a cero. El administrador puede añadir variantes y cambiar precios o estado activo de las existentes. Para corregir una combinación errónea, se crea otra variante y se envía la anterior a la papelera.

Los productos se guardan en una transacción. La API comprueba el rol `owner`, el origen de las escrituras y la revisión vigente antes de modificar el producto. Las variantes existentes permanecen en la ficha para conservar su historial; pueden desactivarse o enviarse a la papelera y restaurarse. Las categorías, marcas y opciones nuevas deben estar activas; las ya asociadas pueden mantenerse aunque después se desactiven en el vocabulario.

## Catálogo público

`/catalogo` muestra solo fichas `active` fuera de la papelera con al menos una variante activa visible. Presenta categoría, marca, descripción, características, imágenes, variantes y precio en BOB. Los borradores, archivados y elementos en la papelera no aparecen. La primera imagen de la ficha es la principal; su URL pública solo es accesible mientras esté asociada a un producto activo o a una publicación de la landing. Una categoría o atributo de variante en la papelera puede ocultar las fichas que dependen de él hasta su restauración.

El catálogo no muestra existencias todavía. La disponibilidad debe confirmarse en la tienda hasta que estén implementados el inventario y el carrito. No hay botón para generar pedidos en esta etapa.

Crear una ficha y sus variantes **no registra existencias ni costo de compra**. Las tablas `stock_movements` y `branch_stock` ya existen, pero todavía no hay endpoints ni interfaz para cargar el inventario inicial. Ese paso requiere un flujo propio que registre sucursal, variante, cantidad, costo y responsable mediante movimientos auditables.

## Prueba local

1. Reconstruye la API y aplica la migración: `sudo docker compose -f compose.dev.yaml up --build -d`.
2. Inicia Next con `npm run dev` y entra como propietario.
3. En `/admin/catalogo/vocabulario`, crea una categoría y, si quieres, un atributo de variante con dos opciones.
4. En `/admin/catalogo/productos`, crea una ficha en borrador con una variante y precio. Comprueba que el SKU aparezca tras guardar y que la ficha no se vea en `/catalogo`.
5. Cambia su estado a **Activo**, guarda y actualiza `/catalogo`. Debe aparecer con su precio. Sube una imagen y guarda de nuevo para verla allí.
6. Añade otra variante con una combinación distinta. Intenta repetir la combinación: la API debe rechazarla. Desactiva la ficha y comprueba que desaparezca del catálogo público.

Antes de almacenar mercancía real, el siguiente paso será registrar movimientos de inventario por sucursal y variante. Después se conectará el carrito con los pedidos persistentes y WhatsApp.
