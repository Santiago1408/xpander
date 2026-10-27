# Production image of the storefront and admin panel (Next.js standalone).
# The API address is fixed at build time because next.config.ts rewrites /api/*.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG XPANDER_API_ORIGIN=http://api:8080
# Public address for absolute links in shared previews, robots.txt and the sitemap.
ARG XPANDER_PUBLIC_ORIGIN
ENV XPANDER_API_ORIGIN=$XPANDER_API_ORIGIN XPANDER_PUBLIC_ORIGIN=$XPANDER_PUBLIC_ORIGIN
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
