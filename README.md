# XPANDER

Tienda de ropa para Bolivia con catálogo, carrito que prepara una solicitud por WhatsApp y panel de administración para contenido, productos, inventario y pedidos.

La [definición inicial y primera entrega](docs/01-alcance-y-primer-entregable.md) recoge las decisiones aprobadas y el orden de desarrollo. Los [recursos provisionales de marca](logos/brand/USO.md) están listos para la interfaz.

## Go para desarrollo local

La versión oficial Go 1.27.3 para Linux x86-64 está instalada en `.tools/go/` y no se añade al repositorio. Desde la raíz del proyecto:

```sh
export PATH="$PWD/.tools/go/bin:$PATH"
go version
```

Este cambio de `PATH` dura solo en la terminal actual. En otra terminal hay que ejecutar de nuevo el `export`. Los contenedores compilan Go por su cuenta y no dependen de esta instalación local.

## Entorno de desarrollo

La [guía del entorno local](docs/02-entorno-local.md) explica cómo arrancar PostgreSQL, aplicar las migraciones y conectar la API Go con Next.js. El [diseño del esquema](docs/03-esquema-y-migraciones.md) documenta las tablas y sus reglas. Este entorno no modifica la aplicación Cabello ni el proxy Caddy del VPS.
