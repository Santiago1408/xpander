# Production image: compiled binaries on a slim base with ImageMagick, which
# processes uploaded photos, logos and QR codes.
FROM golang:1.27-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# The test-data reset tool is left out on purpose: production data is never wiped by a command.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ ./cmd/server ./cmd/migrate ./cmd/bootstrap ./cmd/reset_password

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick ca-certificates \
    && convert -size 1x1 xc:black webp:/tmp/xpander-webp-check.webp \
    && rm /tmp/xpander-webp-check.webp \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin xpander \
    && mkdir -p /srv/media && chown xpander:xpander /srv/media && chmod 700 /srv/media
COPY --from=build /out/ /app/
USER xpander
EXPOSE 8080
CMD ["/app/server"]
