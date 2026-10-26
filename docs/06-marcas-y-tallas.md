# Marcas y tallas

En `/admin/catalogo/marcas`, el propietario puede agregar una marca escribiendo su nombre, modificarlo y eliminarlo. Los nombres se guardan en mayúsculas y se comparan ignorando tildes, espacios y diferencias de capitalización para evitar duplicados.

Al eliminar una marca asociada a productos, el panel muestra cuántos productos la usan y advierte que **esos productos permanecerán registrados sin marca**. La API vuelve a contar los productos antes de borrar: si el número cambió, exige revisar la advertencia de nuevo. Las marcas se eliminan directamente; no pasan por la papelera. El identificador interno de la marca se crea automáticamente y no se pide al administrador.

La marca es opcional en una ficha. Estilo, público y color son textos opcionales guardados en cada producto; el panel muestra sugerencias tomadas de fichas existentes. No existe una administración independiente de categorías ni opciones.

Cada variante tiene dos campos de talla: **alfabética** y **numérica**. Se puede llenar cualquiera de ellos o ambos. Esto también se exige cuando el producto tiene una sola variante; el sistema no genera `ÚNICA`. Una talla alfabética o numérica no puede repetirse en otra variante del mismo producto, incluso con cambios de mayúsculas, espacios o tildes.
