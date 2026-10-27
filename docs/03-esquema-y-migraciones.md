# Esquema inicial y migraciones

Las migraciones SQL están en `api/internal/migrations/sql/`. El programa `api/cmd/migrate` las aplica en orden y registra versión, nombre, checksum SHA-256 y fecha en `schema_migrations`. Si una migración ya aplicada cambia, o la base tiene una versión que el código no conoce, el proceso falla en vez de alterar datos silenciosamente. Todas las migraciones pendientes se ejecutan en una transacción protegida por un bloqueo consultivo de PostgreSQL.

`compose.dev.yaml` ejecuta `migrate` después de que PostgreSQL esté saludable y antes de iniciar la API. Son migraciones de avance: para evolucionar el esquema se añade un nuevo archivo numerado; no se modifica uno ya aplicado. No hay comando `down` automático, porque podría borrar pedidos e inventario. Antes de una migración sobre datos reales se preparará y probará un respaldo.

## Modelo

| Área | Tablas | Decisión principal |
| --- | --- | --- |
| Administración | `users`, `user_sessions`, `branches`, `user_branch_access` | Acceso por nombre de usuario y contraseña; correo opcional y nunca identificador de inicio de sesión. Un propietario global y, más adelante, personal asignado a sucursales. Las sesiones guardan solo el hash del token. No hay cuenta ni contraseña predeterminadas. |
| Contenido | `site_settings`, `business_profile`, `media`, `pages`, `page_sections`, `page_section_media`, `page_publications`, `page_publication_media` | Ajustes del negocio, QR, borrador editable y publicaciones con historial. Una sección eliminada conserva sus datos para restaurarse. Una imagen borrada definitivamente se sustituye por un marcador en las publicaciones. |
| Catálogo | `brands`, `catalog_terms`, `products`, `product_variants`, `product_media` | Marca, estilo y público se administran por separado; el color es un campo de la ficha. Cada variante registra talla alfabética, numérica o ambas. |
| Pedidos | `orders`, `order_items` | Recojo en tienda, identificador idempotente por solicitud y copia histórica de sucursal, producto, talla, SKU y precio. El pedido se guarda antes de abrir WhatsApp; eso no demuestra que el mensaje se envió. |
| Inventario | `branch_stock`, `stock_movements` | Existencia por sucursal y variante; compras con costo unitario, ajustes y salidas por venta. Los movimientos son append-only y actualizan el saldo mediante trigger. |

Todos los importes son enteros en centavos de boliviano: `100` representa Bs 1,00. `price_minor` es precio de venta; `unit_cost_minor` registra el costo de cada entrada por compra. La moneda de los pedidos iniciales es únicamente `BOB`.

No se crean marcas, productos, medios, sucursales ni usuarios ficticios. El inventario permanece vacío. El propietario y la primera sucursal se crean con la herramienta de inicialización; la migración `006` crea únicamente el borrador vacío de la página de inicio.

Las [fichas y variantes](07-productos-y-catalogo.md) se registran desde una sola pantalla. Las [marcas, estilos y públicos](06-marcas-y-tallas.md) se administran en una misma pantalla.

Las migraciones `004` a `013` incorporan el acceso, la landing, el catálogo simplificado, el inventario y los pedidos. La `014` registra estilos de ropa y públicos administrables. La `015` permite retirar inventario de prueba de productos sin pedidos. La `016` autoriza sustituir una imagen borrada en publicaciones históricas. La `017` crea los datos y el QR del negocio. No se modifican migraciones aplicadas. La limpieza de datos de prueba se ejecuta [por separado](10-reinicio-datos-prueba.md).

## Reglas e invariantes

- Un producto puede estar en borrador, activo o archivado. Tiene código de cuatro dígitos y cada variante uno de seis. Se conserva un SKU interno para referencias históricas; el administrador usa los códigos numéricos.
- Toda variante necesita talla alfabética, numérica o ambas. La API impide repetir una talla del mismo sistema dentro de un producto y valida las entradas de stock por sucursal.
- Las existencias no pueden ser negativas. Cada inserción en `stock_movements` actualiza `branch_stock` en la misma transacción; un saldo negativo rechaza toda la inserción. No se deben editar directamente saldos ni movimientos: para corregirlos se registra un ajuste.
- El flujo actual usa `pending` y `confirmed`; el esquema conserva `cancelled` para compatibilidad, sin acción de cancelación en el panel. Al confirmar, la API descuenta existencias en una transacción; la base impide saldos negativos y una segunda salida para el mismo ítem.
- `client_request_id` evita duplicar un pedido cuando el cliente reintenta la solicitud. Los datos históricos del pedido no cambian si luego se editan sucursal, catálogo o precio.
- La papelera permite retirar productos, variantes, imágenes y secciones. Los productos y variantes con pedidos históricos no se borran definitivamente. Una imagen sí puede borrarse: primero se reemplaza por un marcador en las publicaciones que la usaban. Las marcas, estilos y públicos se administran en una misma pantalla y avisan si están asociados a productos.
- `updated_at` se actualizará desde la API en cada modificación. La base establece el valor inicial, no lo cambia automáticamente.

## Aplicación y verificación local

Desde la raíz del proyecto:

```sh
sudo docker compose -f compose.dev.yaml up --build -d
sudo docker compose -f compose.dev.yaml logs migrate
sudo docker compose -f compose.dev.yaml exec -T database psql -U xpander -d xpander -c 'SELECT version, name, applied_at FROM schema_migrations ORDER BY version;'
sudo docker compose -f compose.dev.yaml exec -T database psql -U xpander -d xpander -c '\dt'
```

Debes ver diecisiete versiones aplicadas (`001_foundation.sql` a `017_business_profile.sql`) y las tablas correspondientes. Repetir `up --build -d` no debe duplicarlas. Si el servicio `migrate` falla, consulta sus registros antes de intentar cambios manuales en la base.

Para ejecutar explícitamente el migrador después de añadir una nueva migración:

```sh
sudo docker compose -f compose.dev.yaml build migrate
sudo docker compose -f compose.dev.yaml run --rm migrate
```

Ese comando aplica únicamente versiones pendientes. No hay rollback destructivo automático.
