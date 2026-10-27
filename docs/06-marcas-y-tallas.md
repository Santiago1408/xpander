# Marcas y tallas

En `/admin/catalogo/valores`, el propietario puede agregar una marca escribiendo su nombre, modificarlo y eliminarlo. Los nombres se guardan en mayúsculas y se comparan ignorando tildes, espacios y diferencias de capitalización para evitar duplicados.

Al eliminar una marca asociada a productos, el panel muestra cuántos productos la usan y advierte que **esos productos permanecerán registrados sin marca**. La API vuelve a contar los productos antes de borrar: si el número cambió, exige revisar la advertencia de nuevo. Las marcas se eliminan directamente; no pasan por la papelera. El identificador interno de la marca se crea automáticamente y no se pide al administrador.

La marca es opcional en una ficha. El estilo y el público también son opcionales, pero sus valores se registran y administran en `/admin/catalogo/valores`; el formulario del producto muestra solo esos valores. Modificarlos actualiza las fichas asociadas. Eliminarlos requiere confirmar si hay productos que los usan, y deja esas fichas sin el dato. El color sigue siendo un texto opcional de cada ficha.

Cada variante tiene dos campos de talla: **alfabética** y **numérica**. Se puede llenar cualquiera de ellos o ambos. Esto también se exige cuando el producto tiene una sola variante; el sistema no genera `ÚNICA`. Una talla alfabética o numérica no puede repetirse en otra variante del mismo producto, incluso con cambios de mayúsculas, espacios o tildes.
