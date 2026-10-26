# Identificadores, banco de imágenes y papelera

Cada producto tiene un identificador de texto generado desde su nombre, que puede editarse, además de un código numérico de cuatro dígitos. Cada variante tiene un código numérico de seis dígitos. Los códigos numéricos se asignan automáticamente y no se editan. El SKU interno se conserva para referencias técnicas e históricas.

Productos, variantes, imágenes cargadas y secciones de la landing pueden enviarse a `/admin/papelera`. Después de retirarlos, el panel ofrece **Restaurar** y **Eliminar definitivamente**; la segunda acción requiere confirmación en un modal. La papelera permite vaciar los elementos que ya no tienen referencias que obliguen a conservarlos. Una marca se administra en `/admin/catalogo/marcas` y se elimina directamente tras advertir si hay productos asociados.

El banco de imágenes está en `/admin/medios`. Una imagen puede reutilizarse en varias fichas o secciones. Retirarla del banco impide seleccionarla en nuevas fichas; si aparece en una publicación histórica, el archivo se conserva hasta poder borrar esa referencia. Una variante con pedidos o movimientos puede permanecer en la papelera, pero su borrado definitivo queda bloqueado para preservar el historial.
