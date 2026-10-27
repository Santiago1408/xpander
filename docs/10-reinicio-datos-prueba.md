# Reiniciar los datos de prueba

Este procedimiento deja vacíos catálogo, marcas, estilos, públicos, inventario, movimientos, pedidos, contenido de la landing y banco de imágenes. También borra los archivos de imágenes subidas y reinicia los consecutivos de productos y variantes. **Conserva las cuentas administrativas y las sucursales**, necesarias para entrar y volver a registrar stock. Crea un borrador vacío de la página de inicio.

Desde la raíz del repositorio, primero aplica las migraciones hasta la `017` y detén la API para que nadie cargue imágenes mientras se limpia el volumen:

```sh
sudo docker compose -f compose.dev.yaml up --build -d
sudo docker compose -f compose.dev.yaml logs migrate
sudo docker compose -f compose.dev.yaml stop api
sudo docker compose -f compose.dev.yaml run --rm --no-deps api go run ./cmd/reset_test_data --confirm=BORRAR-DATOS-XPANDER
sudo docker compose -f compose.dev.yaml up -d api
```

El comando de reinicio es explícito e idempotente; no se ejecuta automáticamente durante una migración. Elimina los archivos cargados dentro del volumen `media_data`, incluidos archivos sin registro que tengan el formato de nombre generado por la aplicación. Los recursos de diseño del repositorio, como el logo original, no se borran.

Para comprobar la base:

```sh
sudo docker compose -f compose.dev.yaml exec -T database psql -U xpander -d xpander -c "SELECT (SELECT count(*) FROM products) productos, (SELECT count(*) FROM brands) marcas, (SELECT count(*) FROM branch_stock) saldos, (SELECT count(*) FROM stock_movements) movimientos, (SELECT count(*) FROM orders) pedidos, (SELECT count(*) FROM media) medios, (SELECT count(*) FROM page_sections) secciones;"
```

Todos esos conteos deben ser cero. La cuenta y la sucursal originales deben seguir disponibles para entrar en `/admin`.
