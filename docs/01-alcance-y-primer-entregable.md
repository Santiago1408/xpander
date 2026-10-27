# XPANDER: alcance inicial y primera entrega

## Decisiones confirmadas

- Sitio público: landing, catálogo de destacados y productos, galería, información y contacto.
- Moneda: bolivianos (BOB). Los importes se almacenarán como unidades menores enteras o como `numeric` en PostgreSQL, nunca como flotantes binarios.
- Entrega: recojo por el cliente en la tienda. Los envíos, si existen, se coordinan fuera del sistema.
- Carrito: el servidor valida productos, variantes, cantidades, precios y disponibilidad; guarda la solicitud y devuelve un número de pedido antes de abrir WhatsApp al 59170782380.
- Estados operativos iniciales de pedido: pendiente y confirmado. Abrir WhatsApp no prueba que el mensaje se haya enviado.
- El panel permite administrar todo el contenido de secciones predefinidas de la landing, incluidas imágenes; también ordenarlas, ocultarlas y publicarlas.
- Inventario inicialmente vacío. Un administrador al comienzo, con modelo preparado para más usuarios y sucursales.
- Las marcas, estilos y públicos se administran en el panel. El color es un texto de cada producto; cada variante tiene talla alfabética, numérica o ambas.

## Arquitectura elegida

- Frontend y panel: Next.js con TypeScript.
- API de negocio: Go, iniciando con `net/http` y una estructura modular sencilla.
- Persistencia: PostgreSQL en un proyecto Compose exclusivo de XPANDER.
- Archivos de imagen: volumen persistente y respaldos. Los videos se podrán enlazar desde un servicio externo en la primera versión.
- Entrada pública: Caddy. En producción, `xpander.duckdns.org` dirigirá `/api/*` a Go y el resto a Next; API y base de datos no publicarán puertos del VPS.
- Cabello permanece en su propio Compose y base de datos. La separación del Caddy público se preparará y probará antes del lanzamiento de XPANDER.

## Modelo inicial

- `users`, `user_sessions`, `branches`, `user_branch_access`: un administrador y una sucursal iniciales, sin impedir expansión.
- `brands`, `catalog_terms`: marcas, estilos y públicos administrables. El color se guarda en la ficha y las tallas en cada variante.
- `products`, `product_variants`, `product_media`: ficha comercial, SKU por combinación vendible, precio de venta y medios.
- `stock_movements`, `branch_stock`: entradas, ajustes y salidas auditables por variante y sucursal. El costo de compra se registra en cada entrada.
- `site_settings`, `pages`, `page_sections`, `media`: ajustes globales y contenido editable de la web, orden, visibilidad y referencias a imágenes o videos.
- `orders`, `order_items`: datos de contacto, estado y copia histórica de nombres, variantes, cantidades y precios solicitados.

## Primera entrega verificable

La primera entrega local debe atravesar las tres capas sin esperar a que esté lista toda la tienda:

1. Levantar Next, Go y PostgreSQL con Compose en desarrollo.
2. Iniciar sesión como administrador.
3. Crear una marca, un producto y una variante desde el panel.
4. Ver el producto y su precio en el catálogo público.

Puede usar una imagen provisional y datos de prueba. No requiere mercadería real ni publicar el sitio en el VPS. El acceso administrativo, la edición de la landing, las marcas, las fichas, el inventario, el carrito y los pedidos están implementados. Falta comprobar el flujo completo contra PostgreSQL en el entorno local.

El flujo de pedidos se verificará con nombre y teléfono del cliente, número de pedido, persistencia incluso si WhatsApp se cierra, confirmación en el panel y descuento transaccional de existencias al confirmar.

## Datos que se completarán antes de publicar

- Dirección, horarios de recojo y datos de contacto visibles.
- Fotos, videos, descripciones y precios reales.
- Cuenta inicial del administrador y política de copias de seguridad.
- Registro DNS de `xpander.duckdns.org` y configuración final de Caddy.
- Archivo vectorial original del logo si existe, para crear material final de imprenta.

## Criterios transversales

- Autenticación por sesión con cookie segura y permisos administrados en el servidor.
- Validación de entrada y límites para cargas de archivos; el panel nunca publicará el precio de compra.
- Los pedidos guardan una copia del precio vigente; los cambios posteriores de catálogo no alteran pedidos anteriores.
- El descuento de inventario ocurre al confirmar el pedido, dentro de una transacción que comprueba existencias.
- Registros y copias de seguridad de base de datos y archivos; verificar recuperación antes del lanzamiento.
