# Identificadores, banco de imágenes y papelera

Cada producto tiene un identificador de texto generado desde su nombre, que puede editarse, además de un código numérico de cuatro dígitos. Cada variante tiene un código numérico de seis dígitos. Los códigos numéricos se asignan automáticamente y no se editan. El SKU interno se conserva para referencias técnicas e históricas.

Productos, variantes, imágenes cargadas y secciones de la landing pueden enviarse a `/admin/papelera`. Después de retirarlos, el panel ofrece **Restaurar** y **Eliminar definitivamente**; la segunda acción requiere confirmación en un modal. La papelera permite vaciar los elementos que ya no tienen referencias que obliguen a conservarlos. Una marca se administra en `/admin/catalogo/marcas` y se elimina directamente tras advertir si hay productos asociados.

El banco de imágenes está en `/admin/medios`. Una imagen puede reutilizarse en varias fichas o secciones. Al borrarla definitivamente, se quitan esas asociaciones editables. Si aparece en una publicación histórica, el borrado se rechaza para conservarla. Un producto o variante **sin pedidos** puede borrarse definitivamente junto con sus saldos y movimientos de inventario. Si aparece en pedidos históricos, el borrado se rechaza para preservar sus datos; el panel muestra el motivo.
