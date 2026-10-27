# Entrega al propietario

La tienda se entrega como una instalación nueva en el VPS: sin productos, imágenes, pedidos, cuentas ni sucursales. Lo cargado durante el desarrollo se queda en el entorno local. El propietario crea su propia cuenta el día de la entrega, de modo que nadie más conoce su contraseña.

## 1. Antes de la entrega

Despliega siguiendo la [guía de despliegue](15-despliegue.md) hasta el paso 4, **sin ejecutar `bootstrap`**. Conecta Caddy y comprueba `https://xpandertienda.duckdns.org/api/health`. La página pública mostrará «Estamos preparando la tienda» hasta que se publique la landing.

Comprueba que la base está vacía. En `/opt/xpander`:

```sh
docker compose exec -T database psql -U xpander -d xpander -c "SELECT
  (SELECT count(*) FROM users) cuentas, (SELECT count(*) FROM branches) sucursales,
  (SELECT count(*) FROM products) productos, (SELECT count(*) FROM brands) marcas,
  (SELECT count(*) FROM catalog_terms) estilos_publicos, (SELECT count(*) FROM orders) pedidos,
  (SELECT count(*) FROM stock_movements) movimientos, (SELECT count(*) FROM media) imagenes,
  (SELECT count(*) FROM page_sections) secciones, (SELECT count(*) FROM page_publications) publicaciones,
  (SELECT phone FROM business_profile) telefono;"
docker compose exec api find /srv/media -type f | wc -l
```

Todos los conteos deben ser `0`, el teléfono debe estar vacío y el último comando debe mostrar `0` archivos.

## 2. El día de la entrega: la cuenta del propietario

Con el propietario presente, en el VPS:

```sh
cd /opt/xpander
docker compose --profile setup run --rm bootstrap
```

El propietario escribe su nombre, su usuario y su contraseña (que no se muestra al escribirla), y los datos de la primera sucursal. `bootstrap` solo funciona mientras no exista un propietario, así que no puede volver a ejecutarse para tomar la cuenta. Después, la consulta anterior debe mostrar `cuentas = 1` y `sucursales = 1`.

El propietario entra en `https://xpandertienda.duckdns.org/admin` con su usuario. Puede cambiar su nombre, usuario y contraseña en **Mi cuenta**.

## 3. Primera configuración

En este orden, para que cada paso tenga lo que necesita:

1. **Sucursales:** revisar dirección e indicaciones de recojo de la primera y crear las demás.
2. **Datos del negocio:** teléfono, redes sociales, logos (opcional; si no, se usan los originales) y el **QR de pago con su fecha de vencimiento**. Sin un QR vigente la tienda no acepta pedidos.
3. **Marcas, estilos y público:** registrar los valores que se usarán en los productos.
4. **Productos:** crear las fichas con fotos, tallas, precios y el stock inicial de cada sucursal.
5. **Contenido web:** armar las secciones de la página de inicio, completar la sección de contacto (el pie de todas las páginas) y **publicar**.
6. **Pedido de prueba:** desde el sitio público, registrar un pedido con QR y subir un comprobante; en **Pedidos**, comprobar que llega y cancelarlo para no alterar el stock.
7. **Privacidad:** leer `/privacidad` con el propietario. Es un texto base que describe lo que el sistema guarda; si quiere cambiarlo, el texto está en `app/privacidad/page.tsx`.
8. **Respaldo:** con la carga inicial terminada, ejecutar `deploy/backup.sh` y guardar una copia fuera del VPS.

## Qué queda fuera de la entrega

- El número de WhatsApp que recibe los pedidos se configura en el `.env` del VPS (`ORDER_WHATSAPP_NUMBER`), no desde el panel.
- La herramienta de reinicio de datos de prueba solo existe en el entorno de desarrollo; la imagen de producción no la incluye.
