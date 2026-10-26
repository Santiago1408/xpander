# Vocabulario administrable del catálogo

El propietario puede abrir `/admin/catalogo/vocabulario` para crear y editar categorías, marcas, atributos y sus opciones. Los datos se guardan en las tablas de la migración `002_catalog.sql`; esta etapa no añade migraciones ni valores predeterminados.

## Cómo organizar los atributos

- **Categoría**: agrupa productos, por ejemplo ropa casual o poleras de fútbol.
- **Marca**: identifica una marca; un producto podrá no tener marca.
- **Atributo de producto**: describe toda la ficha, por ejemplo público o material.
- **Atributo de variante**: distingue combinaciones vendibles, por ejemplo talla o color.
- **Opción**: valor concreto de un atributo. Puede tener un color HEX opcional para mostrar una muestra visual.

El propietario decide los nombres y valores. No se crean categorías, tallas, colores ni valores de público automáticamente. Los identificadores técnicos (`slug` y `code`) se sugieren a partir del nombre y el servidor les añade un sufijo si el valor automático ya existe. Se pueden modificar desde el panel. Usan letras minúsculas, números, guion o guion bajo; empiezan con una letra y tienen entre 2 y 64 caracteres. El alcance `product` o `variant` de un atributo queda fijo: cambiarlo después de crear productos podría alterar el significado de sus variantes.

Cada registro se puede renombrar, desactivar o enviar a la papelera y restaurar. La papelera conserva sus referencias históricas y el estado activo anterior; no borra físicamente. La creación de productos ofrece solo categorías, marcas y opciones activas que no estén en la papelera, y la API vuelve a verificarlo antes de guardar.

## Prueba local

Con el entorno arrancado y una sesión de propietario, entra en `/admin/catalogo/vocabulario`:

1. Crea una categoría y una marca con identificadores distintos.
2. Crea un atributo de variante, por ejemplo `talla`, y agrega dos opciones.
3. Crea un atributo de producto, por ejemplo `publico`, y agrega las opciones que necesites.
4. Renombra una opción y desactívala. Recarga la página: debe conservar el nuevo nombre y aparecer inactiva.
5. Intenta crear otra categoría con el mismo identificador: la API debe responder con un conflicto y el panel debe mostrar el error.

Solo las sesiones con rol `owner` pueden consultar o modificar este módulo. Las escrituras también exigen el origen configurado en la API. Las [fichas y variantes](07-productos-y-catalogo.md) ya utilizan este vocabulario.
