# Esquema inicial y migraciones

Las migraciones SQL están en `api/internal/migrations/sql/`. El programa `api/cmd/migrate` las aplica en orden y registra versión, nombre, checksum SHA-256 y fecha en `schema_migrations`. Si una migración ya aplicada cambia, o la base tiene una versión que el código no conoce, el proceso falla en vez de alterar datos silenciosamente. Todas las migraciones pendientes se ejecutan en una transacción protegida por un bloqueo consultivo de PostgreSQL.

`compose.dev.yaml` ejecuta `migrate` después de que PostgreSQL esté saludable y antes de iniciar la API. Son migraciones de avance: para evolucionar el esquema se añade un nuevo archivo numerado; no se modifica uno ya aplicado. No hay comando `down` automático, porque podría borrar pedidos e inventario. Antes de una migración sobre datos reales se preparará y probará un respaldo.

## Modelo

| Área | Tablas | Decisión principal |
| --- | --- | --- |
| Administración | `users`, `user_sessions`, `branches`, `user_branch_access` | Un propietario global y, más adelante, personal asignado a sucursales. Las sesiones guardan solo el hash del token. No hay cuenta ni contraseña predeterminadas. |
| Contenido | `site_settings`, `media`, `pages`, `page_sections`, `page_section_media` | Ajustes globales (por ejemplo contacto y WhatsApp) y páginas con secciones ordenables, publicables y medios reutilizables. Los valores flexibles se validan por clave o tipo en la API. |
| Catálogo | `categories`, `brands`, `attribute_definitions`, `attribute_options`, `products`, `product_option_values`, `product_variants`, `variant_option_values`, `product_media` | El administrador crea categorías y atributos. Los atributos de producto describen la prenda; los de variante distinguen combinaciones vendibles. |
| Pedidos | `orders`, `order_items` | Recojo en tienda, identificador idempotente por solicitud y copia histórica de sucursal, producto, opciones, SKU y precio. El pedido se guarda antes de abrir WhatsApp; eso no demuestra que el mensaje se envió. |
| Inventario | `branch_stock`, `stock_movements` | Existencia por sucursal y variante; compras con costo unitario, ajustes y salidas por venta. Los movimientos son append-only y actualizan el saldo mediante trigger. |

Todos los importes son enteros en centavos de boliviano: `100` representa Bs 1,00. `price_minor` es precio de venta; `unit_cost_minor` registra el costo de cada entrada por compra. La moneda de los pedidos iniciales es únicamente `BOB`.

No se crean categorías, atributos, productos, medios, sucursales ni usuarios ficticios. El inventario permanece vacío. La primera sucursal y el propietario se crearán por un proceso de inicialización seguro en una etapa posterior.

## Reglas e invariantes

- Un producto puede estar en borrador, activo o archivado. Una variante tiene SKU único y una `option_signature` única dentro de su producto. La API deberá construir esa firma de forma canónica a partir de las opciones de variante; la base no compara automáticamente firma y filas de `variant_option_values`.
- Las opciones deben pertenecer a la definición de atributo indicada; una clave foránea compuesta lo exige. La API validará además que un atributo de alcance `product` se use en productos y uno de alcance `variant` en variantes, y evitará cambiar el alcance cuando ya tenga valores.
- Las existencias no pueden ser negativas. Cada inserción en `stock_movements` actualiza `branch_stock` en la misma transacción; un saldo negativo rechaza toda la inserción. No se deben editar directamente saldos ni movimientos: para corregirlos se registra un ajuste.
- Los pedidos admiten `pending`, `confirmed` y `cancelled`. La API solo permitirá pasar de pendiente a confirmado o cancelado. Al confirmar, validará y descontará existencias en una transacción; la base impide saldos negativos y una segunda salida para el mismo ítem, pero la transición y la suma total del pedido son reglas de aplicación.
- `client_request_id` evita duplicar un pedido cuando el cliente reintenta la solicitud. Los datos históricos del pedido no cambian si luego se editan sucursal, catálogo o precio.
- Para mantener referencias históricas, productos, variantes, categorías, marcas y sucursales se desactivan o archivan; no se borran físicamente si tienen referencias.
- `updated_at` se actualizará desde la API en cada modificación. La base establece el valor inicial, no lo cambia automáticamente.

## Aplicación y verificación local

Desde la raíz del proyecto:

```sh
sudo docker compose -f compose.dev.yaml up --build -d
sudo docker compose -f compose.dev.yaml logs migrate
sudo docker compose -f compose.dev.yaml exec -T database psql -U xpander -d xpander -c 'SELECT version, name, applied_at FROM schema_migrations ORDER BY version;'
sudo docker compose -f compose.dev.yaml exec -T database psql -U xpander -d xpander -c '\dt'
```

Debes ver tres versiones aplicadas (`001_foundation.sql`, `002_catalog.sql`, `003_orders_inventory.sql`) y las tablas correspondientes. Repetir `up --build -d` no debe duplicarlas. Si el servicio `migrate` falla, consulta sus registros antes de intentar cambios manuales en la base.

Para ejecutar explícitamente el migrador después de añadir una nueva migración:

```sh
sudo docker compose -f compose.dev.yaml build migrate
sudo docker compose -f compose.dev.yaml run --rm migrate
```

Ese comando aplica únicamente versiones pendientes. No hay rollback destructivo automático.
