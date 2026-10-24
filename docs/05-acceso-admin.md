# Acceso administrativo local

El panel se abre en `/admin/login` y utiliza nombre de usuario y contraseña. El correo es opcional y nunca se usa para iniciar sesión. Las rutas bajo `/admin` comprueban la sesión en el servidor; los endpoints administrativos de Go deben verificarla también.

## Crear la primera cuenta y sucursal

Desde la raíz del repositorio, con las migraciones `001` a `005` aplicadas:

```sh
sudo docker compose -f compose.dev.yaml up --build -d
sudo docker compose -f compose.dev.yaml --profile setup run --rm bootstrap
```

El segundo comando requiere una terminal interactiva. Solicita dos veces la contraseña **sin mostrarla ni recibirla como argumento o variable de entorno**, luego pide el nombre de usuario, nombre visible y datos de la sucursal. Usa una frase de contraseña única de al menos 15 caracteres y un usuario en minúsculas de 3 a 32 caracteres (letras, números, `_` y `-`, comenzando con letra). No compartas la contraseña en el chat, capturas ni archivos. El proceso crea la cuenta `owner` y la sucursal en una sola transacción y se niega a crear otro propietario si ya existe uno.

Inicia Next.js en otra terminal:

```sh
npm run dev
```

Visita `http://localhost:3000/admin/login`, entra con el nombre de usuario elegido, comprueba que `/admin` se abre y usa «Cerrar sesión». En una ventana privada, `/admin` debe redirigir a `/admin/login`.

## Seguridad y límites actuales

- La contraseña se almacena como hash Argon2id con sal aleatoria; nunca en texto plano. El token de sesión se envía en una cookie `HttpOnly`, `SameSite=Lax`, válida por 12 horas, y la base guarda solo su hash. En producción la cookie tendrá además `Secure`.
- Las operaciones de inicio y cierre de sesión aceptan únicamente el `Origin` configurado en `PUBLIC_ORIGIN`. En el Compose local es `http://localhost:3000`; usa exactamente esa dirección en el navegador.
- Hay un límite básico de intentos por usuario y dirección de origen dentro del proceso. Para producción también se necesitarán límites en el proxy y pruebas con su configuración real.
- No existe todavía recuperación automática de contraseña ni administración de múltiples cuentas; se implementarán antes de usar el panel con más personas. No borres el volumen de PostgreSQL para recuperar acceso.
- El panel muestra por ahora una pantalla inicial. Los módulos de contenido, catálogo, inventario y pedidos siguen pendientes.

Al preparar producción, la API deberá configurarse con `APP_ENV=production` y `PUBLIC_ORIGIN=https://xpander.duckdns.org` detrás del Caddy público. Esa configuración no se ha aplicado todavía en el VPS.
