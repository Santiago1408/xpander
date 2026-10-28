# Despliegue en el VPS

XPANDER se publica en `https://xpandertienda.duckdns.org` con su propio proyecto Compose (`compose.prod.yaml`): PostgreSQL, migraciones, API Go y Next.js. Ni la API ni la base publican puertos hacia internet; la entrada pública es el Caddy que ya usa Cabello, al que se agrega un bloque para el dominio de XPANDER. Las imágenes se construyen en el VPS.

## Archivos

| Archivo | Para qué |
| --- | --- |
| `compose.prod.yaml` | Pila de producción. `xpander-web` y `xpander-api` escuchan solo en `127.0.0.1` (puertos 13000 y 18080). Sus nombres son únicos para no confundirse con el `api` o `web` de otro proyecto en una red compartida. |
| `compose.prod.caddy-docker.yaml` | Solo si Caddy corre en Docker: une `xpander-web` y `xpander-api` a una red compartida con Caddy (`CADDY_NETWORK`). |
| `api/Dockerfile`, `Dockerfile` | Imágenes de producción de la API (binarios compilados + ImageMagick) y de Next (modo standalone). |
| `.env.production.example` | Plantilla del `.env` con los secretos; el `.env` real nunca se sube a git. |
| `deploy/Caddyfile.sistema`, `deploy/Caddyfile.docker` | Bloque de Caddy para cada variante, con HTTPS automático y cabeceras de seguridad. |
| `deploy/backup.sh`, `deploy/restore.sh` | Respaldo y restauración manuales. |

## 1. Averiguar cómo corre Caddy

En el VPS:

```sh
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' | grep -i caddy
systemctl is-active caddy
```

- Si el primer comando muestra un contenedor con los puertos 80/443, **Caddy está en Docker**. No se usa la red interna de ese proyecto: se crea una red propia y aislada, `xpander_edge`, a la que solo se unen ese Caddy, `xpander-web` y `xpander-api` (`sudo docker network create xpander_edge`, y `CADDY_NETWORK=xpander_edge` en el `.env`).

**En el VPS actual** Caddy vive dentro del contenedor `web` de Cabello (`cabello_demo-web-1`) y su Caddyfile se copia en la imagen desde `deploy/Caddyfile` del repositorio de Cabello. Ese repositorio ya incluye el bloque de XPANDER y la red `xpander_edge`; ver su `docs/despliegue-demostracion.md`. Docker requiere `sudo` para el usuario `deploy`: antepón `sudo` a todos los comandos `docker` y a `deploy/backup.sh` y `deploy/restore.sh`.
- Si el segundo responde `active`, **Caddy es un servicio del sistema** y su configuración está en `/etc/caddy/Caddyfile`.

## 2. DNS

En duckdns.org, el subdominio `xpandertienda` debe apuntar a la IP pública del VPS. Si la IP del VPS es fija, basta con configurarla una vez. Comprueba con `getent hosts xpandertienda.duckdns.org`.

## 3. Preparar el proyecto

```sh
sudo git clone <repositorio> /opt/xpander
cd /opt/xpander
cp .env.production.example .env
chmod 600 .env
openssl rand -hex 24        # pega el resultado en POSTGRES_PASSWORD
nano .env                   # completa ORDER_WHATSAPP_NUMBER y, si Caddy está en Docker, COMPOSE_FILE y CADDY_NETWORK
```

`COMPOSE_FILE` dentro del `.env` hace que todos los comandos `docker compose` de esta carpeta usen la pila de producción, sin `-f`. Comprueba la configuración con `docker compose config --quiet`: si falta un valor obligatorio, lo indica.

## 4. Construir y arrancar

```sh
docker compose build
docker compose up -d
docker compose logs migrate          # debe terminar aplicando hasta la migración 025
docker compose --profile setup run --rm bootstrap
```

`bootstrap` pide de forma privada el usuario, el nombre, la contraseña del propietario y la primera sucursal. Solo funciona mientras no exista un propietario.

## 5. Conectar Caddy

- **Caddy en Docker:** agrega el contenido de `deploy/Caddyfile.docker` al Caddyfile de ese proyecto. Si el Caddyfile está montado desde el VPS, recárgalo con `docker exec NOMBRE caddy reload --config /etc/caddy/Caddyfile`; si se copia en la imagen (caso de Cabello), reconstruye y reinicia solo ese contenedor.
- **Caddy del sistema:** agrega `deploy/Caddyfile.sistema` a `/etc/caddy/Caddyfile`, valida con `sudo caddy validate --config /etc/caddy/Caddyfile` y recarga con `sudo systemctl reload caddy`.

Caddy obtiene el certificado HTTPS en el primer acceso. Comprueba:

```sh
curl -fsS https://xpandertienda.duckdns.org/api/health     # {"status":"ok"}
curl -sI https://xpandertienda.duckdns.org | grep -i strict-transport
```

Luego entra en `https://xpandertienda.duckdns.org/admin`, carga el QR y los datos del negocio y publica la landing.

## Actualizar a una nueva versión

```sh
cd /opt/xpander
deploy/backup.sh
git pull
docker compose build
docker compose up -d
```

Las migraciones nuevas se aplican solas antes de arrancar la API.

Desde la versión con videos en la landing, el bloque de XPANDER en Caddy limita las peticiones a 12 MB, salvo `/api/admin/media/videos`, que admite 110 MB. Si tu Caddy usa un bloque anterior, cópialo de nuevo desde `deploy/Caddyfile.docker` o `deploy/Caddyfile.sistema` (en Cabello, `deploy/Caddyfile`) y reconstruye o recarga Caddy; sin ese cambio, los videos de más de 12 MB fallan con el error 413.

## Respaldos manuales

`deploy/backup.sh` crea `backups/AAAAMMDD-HHMMSS/` con el volcado de PostgreSQL (`database.dump`), todas las imágenes, logos, QR y comprobantes (`media.tar.gz`) y sus sumas de verificación. Hazlo antes de cada actualización y con regularidad, y copia la carpeta fuera del VPS, por ejemplo desde tu PC:

```sh
scp -r usuario@VPS:/opt/xpander/backups/AAAAMMDD-HHMMSS ./respaldos-xpander/
```

Para restaurar, `deploy/restore.sh backups/AAAAMMDD-HHMMSS` comprueba las sumas, pide escribir `RESTAURAR`, detiene la tienda, reemplaza base e imágenes y la vuelve a arrancar. Antes del lanzamiento, prueba una restauración completa al menos una vez.

## Notas de seguridad

- `APP_ENV=production` activa cookies `Secure` y exige que `PUBLIC_ORIGIN` use HTTPS.
- `TRUST_PROXY_HEADERS=true` hace que el límite de intentos de inicio de sesión cuente la IP real del visitante (la que Caddy agrega a `X-Forwarded-For`) en lugar de la del proxy.
- El número de WhatsApp de pedidos es obligatorio y no tiene valor por defecto.
- Caddy agrega HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` y `Permissions-Policy`, y limita el tamaño de las cargas a 12 MB.
- La política de contenido (CSP) solo permite scripts, estilos, fuentes e imágenes del propio sitio, solo deja incrustar YouTube, Vimeo y Google Maps, impide que otros sitios incrusten la tienda y solo permite enviar formularios al sitio. Admite los scripts en línea que necesita Next. Si una función nueva necesita otro origen (por ejemplo, otro proveedor de video), hay que agregarlo en el bloque de Caddy.
- Si el propietario olvida su contraseña, se recupera con `docker compose --profile setup run --rm reset-password` (ver [acceso administrativo](05-acceso-admin.md)).
- `robots.txt` y `sitemap.xml` usan `PUBLIC_ORIGIN`; las vistas previas al compartir enlaces usan la foto del producto o `/imagen-compartir` (el logotipo de la tienda).
