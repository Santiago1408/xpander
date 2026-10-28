#!/usr/bin/env bash
# Empties the store before handing it over, after the demonstration data used to
# show how it works. It erases products, brands, styles and audiences, stock,
# orders, store sales, payment receipts, images, videos, the landing (draft,
# publications and history) and the suggestions. It keeps the accounts, the
# branches and "Datos del negocio" (phone and social networks); the payment QR
# and the logos are images, so they are cleared and the default logos return.
# Run it from the VPS, in the repository:
#   deploy/vaciar.sh
# It makes a backup first with deploy/backup.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

count() {
  docker compose exec -T database psql -U xpander -d xpander -At -c "$1"
}

echo "Se borrará:"
echo "  productos:          $(count 'SELECT count(*) FROM products')"
echo "  pedidos y ventas:   $(count 'SELECT count(*) FROM orders')"
echo "  imágenes y videos:  $(count 'SELECT count(*) FROM media')"
echo "  secciones landing:  $(count 'SELECT count(*) FROM page_sections')"
echo "  sugerencias:        $(count 'SELECT count(*) FROM suggestions')"
echo "Se conserva:"
echo "  cuentas:            $(count 'SELECT count(*) FROM users')"
echo "  sucursales:         $(count 'SELECT count(*) FROM branches')"
echo "  teléfono y redes de Datos del negocio (sin QR ni logos)"
echo
read -r -p "Esto no se puede deshacer salvo restaurando el respaldo que se hará ahora. Escribe VACIAR para continuar: " answer
[ "$answer" = "VACIAR" ] || { echo "Cancelado."; exit 1; }

deploy/backup.sh

docker compose stop xpander-web xpander-api
echo "Vaciando la base de datos…"
docker compose exec -T database psql -U xpander -d xpander -v ON_ERROR_STOP=1 --single-transaction <<'SQL'
UPDATE business_profile SET qr_media_id = NULL, qr_expires_on = NULL,
    logo_wordmark_media_id = NULL, logo_mark_media_id = NULL, updated_at = now();
TRUNCATE TABLE
    stock_movements, branch_stock, order_payment_proofs, order_items, orders,
    product_media, product_variants, products, brands, catalog_terms,
    page_publication_media, page_publications, page_section_media, page_sections, pages,
    media_variants, suggestions
    RESTART IDENTITY;
-- business_profile keeps a foreign key to media, so media is emptied with DELETE.
DELETE FROM media;
ALTER TABLE media ALTER COLUMN id RESTART WITH 1;
ALTER SEQUENCE xpander_product_code_seq RESTART WITH 1;
ALTER SEQUENCE xpander_variant_sku_seq RESTART WITH 1;
INSERT INTO pages (slug, title, is_published) VALUES ('inicio', 'XPANDER', FALSE);
SQL
echo "Borrando imágenes, videos y comprobantes…"
docker compose run --rm --no-deps -T --entrypoint sh xpander-api -c 'find /srv/media -mindepth 1 -delete'
docker compose up -d xpander-api xpander-web

echo
echo "Tienda vacía. Quedan $(count 'SELECT count(*) FROM users') cuenta(s) y $(count 'SELECT count(*) FROM branches') sucursal(es);"
echo "archivos en /srv/media: $(docker compose run --rm --no-deps -T --entrypoint sh xpander-api -c 'find /srv/media -type f | wc -l')."
echo "Siguiente paso: entrar al panel, cargar el QR, los productos y publicar la página de inicio."
