# Identificadores, SKU, banco de imágenes y papelera

## Identificadores

Cada categoría, marca, atributo y producto conserva un identificador técnico único, independiente de su nombre visible. El formulario lo sugiere a partir del nombre: «Poleras de fútbol» produce `poleras-de-futbol`. El servidor también lo genera si el campo se deja vacío y añade `-2`, `-3`, etcétera cuando el identificador automático ya existe. El propietario puede ajustarlo antes o después de crear el elemento; la API comprueba que no se repita. El nombre visible puede cambiar sin obligar a cambiar el identificador.

El SKU identifica una variante concreta para búsquedas de inventario y futuras referencias de pedidos. PostgreSQL entrega un número de secuencia y Go forma un código como `XP-00000001` al guardar cada variante nueva. PostgreSQL impone unicidad. El administrador solo lo ve; no lo escribe ni lo modifica. Las variantes existentes conservan sus SKU. La secuencia puede tener saltos si una transacción se revierte; eso no implica pérdida de datos.

## Papelera

Categorías, marcas, atributos, opciones, productos, variantes, imágenes y secciones de la landing pueden enviarse a `/admin/papelera`. Al hacerlo, el panel muestra «Restaurar» y «Eliminar definitivamente»; esta última acción abre un modal de confirmación. La papelera también permite restaurar, borrar cada elemento y «Vaciar papelera». La eliminación de una sección guarda el borrador de inmediato; el cambio público sigue esperando «Publicar». La papelera conserva IDs, SKU, relaciones y el estado activo anterior hasta que se confirma el borrado definitivo.

El borrado permanente se ejecuta solo sobre elementos ya enviados a la papelera. Si hay referencias que deben conservarse, devuelve un conflicto y deja el elemento en la papelera. Por ejemplo, una categoría con productos, una imagen usada en una publicación histórica o una variante con movimientos de inventario no se pueden purgar. Para purgar una ficha de prueba sin historial, primero hay que retirar sus relaciones dependientes; la API borra sus variantes junto con la ficha. Los pedidos, movimientos de inventario y publicaciones históricas nunca se purgan desde esta pantalla. Al vaciar la papelera se eliminan los elementos posibles y se informa cuántos quedaron bloqueados.

Al purgar una imagen sin referencias, se borra su registro y después su archivo del volumen. Si falla la operación del sistema de archivos después de confirmar la transacción, la API informa un error y registra el archivo huérfano para que se limpie manualmente en el servidor.

Una categoría en la papelera oculta del catálogo público los productos que dependen de ella. Una variante en la papelera desaparece de la oferta pública; si era la única visible, el producto deja de aparecer. Una imagen de producto en la papelera deja de mostrarse allí. Si la imagen aparece en una publicación de la landing, el archivo sigue disponible para preservar esa publicación: hay que quitarla del borrador y publicar de nuevo para retirarla de la landing actual.

Una variante eliminada puede sustituirse por otra con la misma combinación de opciones; la nueva recibe otro SKU. Si ambas tienen la misma combinación, restaurar la anterior devuelve un conflicto hasta que se elimine la sustituta. Los identificadores de categorías, marcas, atributos y productos eliminados siguen reservados para poder restaurarlos sin cambiar sus referencias; las creaciones automáticas reciben un sufijo si el identificador ya está ocupado.

## Banco de imágenes

`/admin/medios` lista imágenes, muestra cuántas relaciones actuales e históricas tienen, permite subir PNG/JPEG y moverlas a la papelera o restaurarlas. En los editores de landing y productos se puede subir una imagen o elegir una existente del banco. La selección reutiliza el mismo registro `media` y el mismo archivo del volumen `media_data`; no crea otra copia. La primera imagen de una ficha de producto es la principal.

El texto alternativo permanece por ahora en el registro global de la imagen. Antes de un rediseño final conviene permitir un texto alternativo por uso, porque una misma foto puede necesitar descripciones distintas en la portada y en una ficha. También quedan pendientes miniaturas derivadas, paginación y limpieza física controlada de archivos nunca utilizados.

## Verificación local

Después de `sudo docker compose -f compose.dev.yaml up --build -d`, crea una categoría de prueba y envíala a la papelera. Comprueba que aparece el aviso con ambos botones y que `/admin/papelera` la lista. Restaúrala; repite el proceso y confirma el borrado definitivo en el modal. Crea después un producto y una variante de prueba, elimínalos y comprueba que la papelera bloquea la purga de la categoría mientras el producto aún la referencia. Prueba «Vaciar papelera» solo con datos de prueba. Sube una imagen en `/admin/medios`, elígela en una ficha y en la landing, y comprueba que el banco muestra sus usos.
