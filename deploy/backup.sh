#!/usr/bin/env bash
# Manual backup of the production stack: a PostgreSQL dump plus every uploaded
# image, logo, QR and payment receipt. Run it from the VPS, in the repository:
#   deploy/backup.sh
# It writes backups/AAAAMMDD-HHMMSS/ with a checksum file. Copy that folder
# off the server (for example with scp) to survive losing the VPS.
set -euo pipefail
cd "$(dirname "$0")/.."

stamp=$(date +%Y%m%d-%H%M%S)
target="backups/$stamp"
mkdir -p "$target"
chmod 700 backups "$target"

echo "Respaldando la base de datos…"
docker compose exec -T database pg_dump -U xpander -d xpander --format=custom > "$target/database.dump"

echo "Respaldando imágenes y comprobantes…"
docker compose run --rm --no-deps -T --entrypoint tar xpander-api -C /srv/media -czf - . > "$target/media.tar.gz"

(cd "$target" && sha256sum database.dump media.tar.gz > SHA256SUMS)
# Run with sudo, the files would belong to root; hand them to the user who ran
# it so the folder can be copied off the server with scp.
if [ -n "${SUDO_USER:-}" ]; then
  chown -R "$SUDO_USER": backups
fi
echo "Respaldo listo en $target ($(du -sh "$target" | cut -f1))."
