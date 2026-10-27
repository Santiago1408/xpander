# Productos, variantes y catálogo

## Registro

En `/admin/catalogo/productos`, el propietario registra en una pantalla nombre, descripción, estilo, público, color, marca opcional, imágenes, precios, tallas y stock. Cada color es un producto diferente. El nombre, los textos estructurados y las tallas se guardan en mayúsculas; la descripción conserva su escritura. Estilo y público se administran en `/admin/catalogo/etiquetas`, igual que las [marcas](06-marcas-y-tallas.md) en su apartado. El color permanece como texto de la ficha.

La primera variante forma parte del formulario desde el comienzo. Su talla alfabética, numérica o ambas son obligatorias. Si se añade otra variante, la talla ya introducida sigue siendo la de la primera; cada nueva variante tiene sus propios campos de talla, precio normal, oferta opcional y entradas de stock. El precio de oferta debe ser menor que el normal. El formulario impide repetir una talla alfabética o numérica dentro del producto.

El identificador de texto (`slug`) se genera desde el nombre y puede corregirse. Se reserva para una futura URL individual. El administrador no escribe SKU ni códigos de inventario.

## Códigos e inventario

PostgreSQL asigna un código de producto de cuatro dígitos y un código de variante de seis. Los primeros cuatro dígitos de la variante son los del producto y los dos finales son su consecutivo: producto `0042`, variantes `004201` y `004202`. Los códigos de elementos eliminados no se reutilizan. Las fichas anteriores reciben código durante la migración `010`; la migración `011` reemplaza el sistema anterior de categorías y opciones por campos simples.

En una variante se pueden añadir entradas de stock para **una o más sucursales**. Cada entrada tiene sucursal, unidades y costo de compra por unidad. El guardado del producto, variantes, imágenes y movimientos ocurre en una transacción: si falla una parte, no se registra ninguna. Al editar la ficha, una entrada nueva suma existencias; los campos vuelven vacíos para evitar sumas accidentales. Para compras posteriores con otro costo se usa `/admin/inventario`, que registra un nuevo movimiento sin alterar el costo histórico. Los ajustes de saldo también se hacen allí.

Las imágenes pueden subirse desde la ficha o elegirse del banco; la primera es la principal. Subir una imagen la añade al banco antes de asociarla al producto. Si se abandona la ficha, esa imagen seguirá en el banco hasta que se elimine.

## Vista pública y pruebas

`/catalogo` muestra fichas activas fuera de la papelera con alguna variante activa. Presenta nombre, descripción, estilo, público, color, marca, tallas, códigos, imágenes y precios en bolivianos. Permite buscar por nombre o código y filtrar por estilo, público, marca y color. También permite agregar variantes al carrito y registrar pedidos para recojo en tienda. La disponibilidad se comprueba al registrar el pedido y de nuevo al confirmarlo; no se publica el saldo exacto. Consulta el [flujo de pedidos](11-carrito-y-pedidos.md).

Para verificar el flujo local:

1. Aplica todas las migraciones y ejecuta el [reinicio de datos de prueba](10-reinicio-datos-prueba.md) solo si deseas la tienda vacía.
2. Crea una marca en `/admin/catalogo/marcas` y un producto con una talla alfabética o numérica. Guarda y comprueba sus códigos de cuatro y seis dígitos.
3. Añade una entrada de stock de esa variante en dos sucursales, con cantidades y costos distintos. Comprueba ambos saldos y movimientos en `/admin/inventario`.
4. Edita el producto y añade una segunda variante. Comprueba que la talla original permanece en la primera. Intenta duplicar una talla en la segunda: la API debe rechazarla.
5. Registra una nueva compra desde Inventario con otro costo. El movimiento anterior debe conservar su propio costo. Elimina la marca: el panel debe advertir que hay productos asociados y, tras confirmar, la ficha debe permanecer sin marca.
