#!/usr/bin/env bash
# Restores a backup made by deploy/backup.sh, replacing the current database and
# media files. The store is stopped while it runs.
#   deploy/restore.sh backups/AAAAMMDD-HHMMSS
set -euo pipefail
cd "$(dirname "$0")/.."

source=${1:?Uso: deploy/restore.sh backups/AAAAMMDD-HHMMSS}
for file in database.dump media.tar.gz SHA256SUMS; do
  [ -f "$source/$file" ] || { echo "Falta $source/$file" >&2; exit 1; }
done
(cd "$source" && sha256sum --check --quiet SHA256SUMS)

read -r -p "Se reemplazarán la base y las imágenes actuales por las de $source. Escribe RESTAURAR para continuar: " answer
[ "$answer" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

docker compose stop web api
echo "Restaurando la base de datos…"
docker compose exec -T database pg_restore -U xpander -d xpander --clean --if-exists --no-owner --single-transaction < "$source/database.dump"
echo "Restaurando imágenes y comprobantes…"
docker compose run --rm --no-deps -T --entrypoint sh api -c 'find /srv/media -mindepth 1 -delete && tar -C /srv/media -xzf -' < "$source/media.tar.gz"
docker compose up -d api web
echo "Restauración terminada."
