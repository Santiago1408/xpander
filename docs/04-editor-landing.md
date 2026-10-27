# Acceso administrativo y editor de la landing

Las migraciones `004_username_login.sql`, `005_landing_publications.sql` y `006_landing_draft.sql` preparan el acceso, el historial y la página inicial. El [acceso administrativo](05-acceso-admin.md) y la primera versión del editor ya están implementados.

## Acceso por nombre de usuario

`users.username` es obligatorio, único sin distinguir mayúsculas y se guarda en minúsculas. Acepta de 3 a 32 caracteres: empieza con una letra y continúa con letras minúsculas, números, guion o guion bajo. Si había usuarios creados manualmente antes de la migración, reciben un nombre provisional `usuario_<id>` que deberá cambiarse. `email` queda opcional y no servirá para iniciar sesión.

El primer propietario se crea mediante una herramienta de inicialización que solicita la contraseña de forma privada y nunca la registra ni la incluye en un archivo de migración. La API valida nombre de usuario y contraseña y crea una sesión revocable en `user_sessions`. Los endpoints del editor comprueban el rol en Go: solo `owner` puede editar o publicar contenido global.

## Borrador, publicación y restauración

`pages`, `page_sections` y `page_section_media` son el borrador. Guardar un cambio, reordenar, ocultar (`is_visible = false`) o eliminar una sección (`deleted_at` con fecha) no modifica la web pública. Restaurar limpia `deleted_at` y `deleted_by_user_id`. La API aumenta `pages.draft_revision` cada vez que se guarda el borrador; rechaza una revisión anterior con HTTP 409 para evitar sobrescribir cambios de otra sesión.

La acción «Publicar» se realiza en una sola transacción: bloquea la página, comprueba la revisión del borrador, asigna el próximo número de versión, genera una copia completa en `page_publications.snapshot`, registra los medios usados en `page_publication_media` y marca la página como publicada. La API pública sirve exclusivamente la publicación más reciente de una página con `is_published = true`; nunca lee las secciones de borrador. Las publicaciones existentes solo cambian si el dueño elimina definitivamente una imagen: en ese caso se sustituye por un marcador en las versiones afectadas. La interfaz muestra el historial, pero todavía no permite restaurar una publicación antigua como borrador.

El snapshot (`snapshot_schema_version = 1`) contiene título, metadatos SEO y las secciones visibles en orden, con sus textos e imágenes. Admite `hero`, `text`, `gallery`, `contact`, `video`, `featured` y `categories` (bloques de imágenes grandes: tarjetas o paneles en 1 a 3 columnas, cada bloque con su imagen, su texto y un enlace opcional al catálogo filtrado por estilo, público o marca; si existe, reemplaza el bloque automático «Compra por estilo»). También admite `benefits` (hasta 6 beneficios con ícono, título y texto; si existe, reemplaza la franja automática de beneficios antes del pie). La sección de contacto (`contact`) no se muestra entre las demás: la primera visible es el pie de página de toda la tienda (inicio, catálogo y ficha de producto), con fondo oscuro y el título a todo el ancho; su posición en el borrador no importa y el editor la agrupa aparte en «Pie de página». Muestra un enlace de WhatsApp con el teléfono del negocio cuando no se definió uno propio. Si no hay sección de contacto visible, el pie usa el teléfono y las redes de Datos del negocio con el título «Contáctanos». Las secciones ocultas o eliminadas no aparecen en él. El bloque destacado consulta nombres, imágenes y precios del catálogo activo; el dueño elige las fichas mediante «Destacado» en cada producto. El video conserva un enlace validado de YouTube o Vimeo, sin archivos de video en el VPS.

`page_publication_media` identifica imágenes usadas por versiones antiguas, aunque ya no aparezcan en el borrador. Las imágenes PNG y JPEG se validan, se recodifican y se guardan en el volumen Compose `media_data`; cada archivo admite hasta 8 MB y 12 megapíxeles de entrada. La URL pública de una imagen funciona si aparece en una publicación, un producto activo o el QR activo. La vista previa usa una URL administrativa protegida por sesión. En despliegues reales hay que respaldar tanto PostgreSQL como `media_data`; aún no existe limpieza automática de archivos huérfanos.

Los datos operativos de `site_settings` —por ejemplo el número que recibe pedidos— son independientes de la publicación de la landing. El teléfono o texto **visible en la landing** debe formar parte de una sección publicada; cambiar el destino operativo de WhatsApp requerirá un control administrativo separado.

## Uso local

1. Desde la raíz, ejecuta `sudo docker compose -f compose.dev.yaml up --build -d` y después `npm run dev`.
2. Inicia sesión en `/admin/login` y abre `/admin/contenido`.
3. Agrega una portada o una sección de texto, cambia su contenido y pulsa **Guardar borrador**. La página `/` seguirá mostrando la publicación anterior o el mensaje de preparación.
4. Pulsa **Publicar** y actualiza `/`. Oculta o elimina una sección, guarda y comprueba que `/` siga igual; publícala para aplicar el cambio. Usa **Restaurar** y vuelve a publicar para recuperarla.

El editor actual permite título y metadatos SEO, textos, orden, visibilidad, eliminación recuperable, imágenes, enlaces sociales, mapa en el pie de página, videos externos y un bloque de destacados. Las imágenes pueden subirse allí o elegirse del banco en `/admin/medios`. La restauración de versiones históricas y la edición del destino operativo de WhatsApp quedan para siguientes etapas. La vista previa usa el mismo componente visual que la página pública, pero no sustituye una prueba del sitio publicado.

## Generador de imágenes para redes

En `/admin/generador` el dueño sube una foto con fondo blanco, escribe el nombre, las tallas disponibles y el precio (uno solo, un rango «desde – hasta» o un precio anterior para ofertas) y elige una de cinco plantillas. El generador no lee el catálogo ni el inventario: solo usa lo que se escribe. La imagen se compone en el navegador con el logo y se descarga como PNG; la foto no se guarda en el servidor.
