# Entorno local de XPANDER

Esta base conecta Next.js con una API Go y PostgreSQL. El esquema inicial se instala mediante migraciones, pero todavía no hay datos reales, productos ni pedidos. No debe desplegarse en producción tal como está: la contraseña de PostgreSQL en `compose.dev.yaml` es solo para desarrollo.

## Requisitos

- Node.js y las dependencias del proyecto (`npm ci`).
- Docker con el complemento Compose.
- La instalación de Go en `.tools/go/` es útil para ejecutar pruebas locales, pero Compose usa su propia imagen de Go.

## Arranque

Desde la raíz del repositorio, inicia la base de datos, aplica las migraciones y arranca la API:

```sh
sudo docker compose -f compose.dev.yaml up --build -d
```

Si tu usuario ya tiene permiso para acceder al daemon Docker, omite `sudo`. El `sudo` se ejecuta en tu terminal para que puedas introducir tu contraseña; no debe copiarse aquí ni guardarse en archivos.

En otra terminal inicia Next.js:

```sh
npm run dev
```

La página se abre en `http://localhost:3000`. El navegador pide `/api/*` a Next.js y Next.js reenvía esas rutas a la API Go local en `127.0.0.1:8080`. PostgreSQL, el migrador y Go están en una red privada de Compose; solo la API se publica en la interfaz de loopback. Ninguno de estos contenedores reclama los puertos públicos 80 o 443.

Para crear el primer propietario y la primera sucursal, sigue la [guía de acceso administrativo](05-acceso-admin.md). Después podrás iniciar sesión en `http://localhost:3000/admin/login`.

## Comprobación

```sh
curl -i http://127.0.0.1:8080/api/live
curl -i http://127.0.0.1:8080/api/health
curl -i http://127.0.0.1:3000/api/health
```

Los tres deben responder `200` con `{"status":"ok"}`. `/api/live` indica que el proceso Go está activo; `/api/health` comprueba además PostgreSQL. Si la base no está disponible, `/api/health` responde `503` con `{"status":"database_unavailable"}`.

Comprueba también las migraciones con los comandos de la [guía del esquema](03-esquema-y-migraciones.md).

Para consultar los registros:

```sh
sudo docker compose -f compose.dev.yaml logs -f migrate api database
```

Para detener los servicios sin borrar los datos:

```sh
sudo docker compose -f compose.dev.yaml down
```

No uses `down -v` salvo que quieras borrar expresamente la base de datos local **y las imágenes cargadas en `media_data`**. El editor de la landing está en `/admin/contenido`, las marcas en `/admin/catalogo/marcas`, las fichas en `/admin/catalogo/productos`, el inventario en `/admin/inventario`, los pedidos en `/admin/pedidos` y el catálogo público en `/catalogo`. Para limpiar los datos de prueba conservando la cuenta administrativa y las sucursales, usa el [comando de reinicio](10-reinicio-datos-prueba.md).
