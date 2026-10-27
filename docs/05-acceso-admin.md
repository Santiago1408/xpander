# Acceso administrativo local

El panel se abre en `/admin/login` y utiliza nombre de usuario y contraseña. El correo es opcional y nunca se usa para iniciar sesión. Las rutas bajo `/admin` comprueban la sesión en el servidor; los endpoints administrativos de Go deben verificarla también.

## Crear la primera cuenta y sucursal

Desde la raíz del repositorio, Compose aplicará todas las migraciones pendientes antes de arrancar la API:

```sh
sudo docker compose -f compose.dev.yaml up --build -d
sudo docker compose -f compose.dev.yaml --profile setup run --rm bootstrap
```

El segundo comando requiere una terminal interactiva. Solicita dos veces la contraseña **sin mostrarla ni recibirla como argumento o variable de entorno**, luego pide el nombre de usuario, nombre visible y datos de la sucursal. La única regla de composición es tener más de 6 caracteres (con un límite técnico de 1024 bytes); se recomienda una contraseña larga y única. El usuario va en minúsculas, tiene de 3 a 32 caracteres (letras, números, `_` y `-`, comenzando con letra). No compartas la contraseña en el chat, capturas ni archivos. El proceso crea la cuenta `owner` y la sucursal en una sola transacción y se niega a crear otro propietario si ya existe uno.

Inicia Next.js en otra terminal:

```sh
npm run dev
```

Visita `http://localhost:3000/admin/login`, entra con el nombre de usuario elegido, comprueba que `/admin` se abre y usa «Cerrar sesión». En una ventana privada, `/admin` debe redirigir a `/admin/login`.

## Seguridad y límites actuales

- La contraseña se almacena como hash Argon2id con sal aleatoria; nunca en texto plano. El token de sesión se envía en una cookie `HttpOnly`, `SameSite=Lax`, válida por 12 horas, y la base guarda solo su hash. En producción la cookie tendrá además `Secure`.
- Las operaciones de inicio y cierre de sesión aceptan únicamente el `Origin` configurado en `PUBLIC_ORIGIN`. En el Compose local es `http://localhost:3000`; usa exactamente esa dirección en el navegador.
- Hay un límite básico de intentos por usuario y dirección de origen dentro del proceso. Para producción también se necesitarán límites en el proxy y pruebas con su configuración real.
- En `/admin/cuenta` el administrador cambia su nombre visible, su nombre de usuario y su contraseña; cada cambio exige la contraseña actual y comparte el límite de intentos del inicio de sesión. Cambiar la contraseña cierra las sesiones de otros dispositivos.
- No hay recuperación por correo ni administración de múltiples cuentas. No borres el volumen de PostgreSQL para recuperar acceso: usa el comando de la sección siguiente.

## Recuperar el acceso si se olvida la contraseña

Quien administre el servidor ejecuta, en la carpeta del proyecto:

```sh
docker compose --profile setup run --rm reset-password                              # producción (/opt/xpander)
sudo docker compose -f compose.dev.yaml --profile setup run --rm reset-password     # desarrollo
```

El comando muestra las cuentas activas, pide el usuario y dos veces la contraseña nueva **sin mostrarla**, la guarda con las mismas reglas que el panel y cierra todas las sesiones abiertas de esa cuenta. Lo ideal es que el propietario escriba él mismo la contraseña nueva; después puede cambiarla cuando quiera en **Mi cuenta**.
- El panel incluye contenido, catálogo, inventario y pedidos. El flujo completo de pedidos requiere una prueba local con PostgreSQL antes de preparar producción.

Al preparar producción, la API deberá configurarse con `APP_ENV=production` y `PUBLIC_ORIGIN=https://xpander.duckdns.org` detrás del Caddy público. Esa configuración no se ha aplicado todavía en el VPS.
