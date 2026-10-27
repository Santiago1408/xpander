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

La [guía del editor de la landing](docs/04-editor-landing.md) explica cómo editar secciones, cargar imágenes, guardar un borrador y publicar una versión visible para visitantes.

La [guía de acceso administrativo](docs/05-acceso-admin.md) explica cómo crear la primera cuenta y sucursal y probar `/admin` sin poner contraseñas en el repositorio.

La ficha de producto incluye tallas alfabéticas y numéricas, precios e inventario por sucursal. Las [marcas, los estilos y los públicos](docs/06-marcas-y-tallas.md) se administran en apartados propios.

La [guía de productos](docs/07-productos-y-catalogo.md) describe cómo crear fichas y variantes, y cómo comprobar su publicación en `/catalogo`.

El [banco de imágenes y la papelera](docs/08-identificadores-y-papelera.md) permiten reutilizar imágenes y restaurar elementos retirados del panel.
El [inventario inicial y la evaluación del QR](docs/09-inventario-y-qr.md) describen la carga por variante y las condiciones para añadir pagos manuales.

El [carrito y los pedidos por WhatsApp](docs/11-carrito-y-pedidos.md) explican cómo registrar y confirmar solicitudes sin pasarela de pago.

La [verificación del catálogo, la sucursal, el carrito y la papelera](docs/12-verificacion-catalogo-sucursal-papelera.md) cubre las migraciones y los flujos de administración recientes.

Para empezar las pruebas con catálogo, pedidos, contenido e imágenes vacíos conservando la cuenta y las sucursales, sigue el [reinicio de datos de prueba](docs/10-reinicio-datos-prueba.md).
