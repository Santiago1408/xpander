# Identificadores, SKU, banco de imágenes y papelera

## Identificadores

Cada categoría, marca, atributo y producto conserva un identificador técnico único, independiente de su nombre visible. El formulario lo sugiere a partir del nombre: «Poleras de fútbol» produce `poleras-de-futbol`. El servidor también lo genera si el campo se deja vacío y añade `-2`, `-3`, etcétera cuando el identificador automático ya existe. El propietario puede ajustarlo antes o después de crear el elemento; la API comprueba que no se repita. El nombre visible puede cambiar sin obligar a cambiar el identificador.

El SKU identifica una variante concreta para búsquedas de inventario y futuras referencias de pedidos. PostgreSQL entrega un número de secuencia y Go forma un código como `XP-00000001` al guardar cada variante nueva. PostgreSQL impone unicidad. El administrador solo lo ve; no lo escribe ni lo modifica. Las variantes existentes conservan sus SKU. La secuencia puede tener saltos si una transacción se revierte; eso no implica pérdida de datos.

## Papelera

Categorías, marcas, atributos, opciones, productos, variantes e imágenes pueden enviarse a la papelera y restaurarse. Las secciones de la landing ya admitían eliminación restaurable dentro del borrador; el cambio público sigue esperando «Publicar». La papelera conserva IDs, SKU, relaciones y el estado activo anterior. Los pedidos, movimientos de inventario y publicaciones históricas no se borran. No hay purga física automática.

Una categoría en la papelera oculta del catálogo público los productos que dependen de ella. Una variante en la papelera desaparece de la oferta pública; si era la única visible, el producto deja de aparecer. Una imagen de producto en la papelera deja de mostrarse allí. Si la imagen aparece en una publicación de la landing, el archivo sigue disponible para preservar esa publicación: hay que quitarla del borrador y publicar de nuevo para retirarla de la landing actual.

Una variante eliminada puede sustituirse por otra con la misma combinación de opciones; la nueva recibe otro SKU. Si ambas tienen la misma combinación, restaurar la anterior devuelve un conflicto hasta que se elimine la sustituta. Los identificadores de categorías, marcas, atributos y productos eliminados siguen reservados para poder restaurarlos sin cambiar sus referencias; las creaciones automáticas reciben un sufijo si el identificador ya está ocupado.

## Banco de imágenes

`/admin/medios` lista imágenes, muestra cuántas relaciones actuales e históricas tienen, permite subir PNG/JPEG y moverlas a la papelera o restaurarlas. En los editores de landing y productos se puede subir una imagen o elegir una existente del banco. La selección reutiliza el mismo registro `media` y el mismo archivo del volumen `media_data`; no crea otra copia. La primera imagen de una ficha de producto es la principal.

El texto alternativo permanece por ahora en el registro global de la imagen. Antes de un rediseño final conviene permitir un texto alternativo por uso, porque una misma foto puede necesitar descripciones distintas en la portada y en una ficha. También quedan pendientes miniaturas derivadas, paginación y limpieza física controlada de archivos nunca utilizados.

## Verificación local

Después de `sudo docker compose -f compose.dev.yaml up --build -d`, confirma que se aplicó `008_recycle_bin.sql`. Crea una categoría y comprueba el identificador sugerido; cambia el nombre y verifica que el identificador pueda conservarse o editarse. Crea una ficha con dos variantes y confirma que cada SKU aparece después de guardar, sin escribirlo. Envía una variante, la ficha y una categoría a la papelera y restaúralas; verifica `/catalogo` después de cada operación. Sube una imagen en `/admin/medios`, elígela en una ficha y en una sección de la landing, y comprueba que el banco muestra sus usos.
