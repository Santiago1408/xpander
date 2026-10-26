# Productos, tallas y catálogo público

## Registro en una pantalla

En `/admin/catalogo/productos` se registra el producto completo: nombre, descripción, estilo, público, marca, color, imágenes, tallas, precios, oferta opcional y stock inicial. El nombre, estilo, público, marca, color y tallas se guardan en mayúsculas; **la descripción conserva la escritura del administrador**. El producto representa un solo color. Para vender la misma prenda en otro color, se crea otro producto.

Estilo y público son categorías diferentes y opcionales. Marca y color también son opcionales. Al escribir un valor nuevo, se crea durante el guardado de la ficha; si ya existe uno equivalente, se reutiliza. La comparación ignora mayúsculas, tildes y espacios. Las sugerencias evitan tener que gestionar esas listas antes de crear un producto. El desplegable «Corregir valores…» permite enviar valores erróneos a la papelera. «Etiquetas» solo era una forma informal de llamar a estos valores descriptivos; **no existe un campo adicional de etiquetas**.

Cada producto tiene al menos una talla. Con una sola variante, la talla es `ÚNICA` y no se edita. Al añadir otras variantes se escribe una talla distinta para cada una, en cualquier sistema de tallas. No se permite repetir una talla con otra escritura equivalente dentro del mismo producto. Cada variante tiene precio normal y, opcionalmente, un precio de oferta menor. No se piden SKU ni combinaciones de atributos al administrador.

El identificador de texto (`slug`) se sugiere a partir del nombre y puede corregirse. Se reserva para una futura URL individual. No es el código de inventario.

## Códigos automáticos

La migración `010_quick_product_entry.sql` asigna un **código de producto de cuatro dígitos** (`0001` a `9999`) y un **código de variante de seis dígitos**. Los primeros cuatro dígitos de cada variante son el código de producto; los últimos dos son un consecutivo (`01` a `99`). Por ejemplo, `0042` identifica el producto y `004201`, `004202` sus tallas. El número se asigna en PostgreSQL y nunca se reutiliza cuando una ficha o talla se elimina. Esto deja margen para 5000 productos, siempre que no se agoten códigos por creaciones de prueba, reintentos fallidos o eliminaciones. Los códigos existentes se asignan por orden de ID al aplicar la migración.

El SKU anterior se conserva internamente para compatibilidad con los pedidos e inventario existentes, pero la interfaz usa el código numérico. El administrador no lo escribe ni lo modifica.

## Inventario e imágenes

Una entrada de stock requiere sucursal, cantidad y costo de compra unitario. En un producto nuevo es el stock inicial; al editar uno existente, la cantidad se **suma** al saldo mediante un movimiento de compra. Dejar la cantidad vacía o en cero no altera el inventario. Para corregir o reducir existencias se usa el [panel de inventario](09-inventario-y-qr.md), que conserva el historial de ajustes. Los precios y costos se capturan en bolivianos y se guardan como centavos enteros.

Se pueden subir imágenes desde la ficha o elegirlas del banco. Subir una imagen la incorpora primero al banco; guardar el producto la asocia con la ficha. La primera imagen es la principal. Una carga abandonada puede dejar una imagen sin usar en el banco, desde donde se puede reutilizar o enviar a la papelera.

El guardado de producto, tallas, referencias a imágenes y entradas de stock se hace en una transacción. La API comprueba sesión de propietario, origen y revisión para rechazar cambios hechos sobre una ficha desactualizada. La clave de solicitud de una ficha nueva evita duplicarla si se reintenta tras una respuesta perdida.

## Catálogo público y datos anteriores

`/catalogo` muestra fichas activas fuera de la papelera con al menos una variante activa. Presenta imagen, código, nombre, descripción, estilo, público, color, marca, tallas y precios en BOB. Los borradores y archivados no se muestran. «Destacado» modifica el orden y añade una señal dentro del catálogo; aún no inserta automáticamente el producto en la landing. Las existencias no aparecen todavía en el catálogo público, y todavía no hay carrito ni generación de pedidos desde la página.

Las tablas anteriores de atributos y opciones se conservan para leer datos históricos. Las categorías anteriores pasan a ser de estilo; si alguna representaba público, habrá que revisarla al editar la ficha. Al guardar una ficha anterior desde el formulario nuevo, sus opciones de atributos anteriores se sustituyen por el modelo simple de tallas y valores del nuevo formulario. Revísala antes de guardarla. La papelera conserva productos y variantes cuando existen referencias históricas; su eliminación definitiva puede estar bloqueada por pedidos o inventario.

## Verificación local

1. Aplica la migración y reconstruye la API con `sudo docker compose -f compose.dev.yaml up --build -d`. Comprueba que aparezca la versión `010` en `schema_migrations` y que `migrate` termine sin errores.
2. Abre `/admin/catalogo/productos` como propietario. Crea un producto con nombre mixto, descripción con minúsculas, estilo, público, marca y color nuevos. Añade una sola talla, precio, sucursal, stock y costo. Guarda. El nombre y los valores deben verse en mayúsculas; la descripción debe conservar las minúsculas; la talla debe ser `ÚNICA`.
3. Comprueba que el producto tiene código de cuatro dígitos, la talla código de seis, y la entrada aparece en `/admin/inventario` con cantidad y costo. Vuelve a abrir la ficha: el campo de stock debe estar vacío, porque una nueva cantidad sería otra entrada.
4. Añade dos tallas distintas y precios de oferta. Repite una talla con distinta capitalización o acento: debe rechazarse. Verifica que los códigos antiguos no cambian y que los nuevos siguen la numeración del producto.
5. Escribe de nuevo una marca o categoría cambiando acentos, espacios o mayúsculas. Debe reutilizar el valor anterior. Pon la ficha en borrador y comprueba que desaparece de `/catalogo`; vuelve a activarla y revisa sus precios e imágenes.
