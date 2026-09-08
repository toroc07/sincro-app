# syntax=docker/dockerfile:1
#
# Imagen multi-target del monorepo. Un solo `npm ci` cacheado (stage `base`)
# alimenta los tres servicios Node: `web` (Next standalone), `audio`
# (audio-service vía tsx) y `migrate` (one-shot de migraciones + seed).
# El servicio Python de rutas vive en backend/routing/Dockerfile.

# ---- base: dependencias del monorepo (capa cacheada) ----------------------
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/
COPY backend/package.json backend/
RUN npm ci

# ---- source: código común del monorepo -----------------------------------
FROM base AS source
COPY packages ./packages
COPY apps ./apps
COPY backend ./backend
COPY scripts ./scripts

# ---- web-build: next build (output standalone) --------------------------
FROM source AS web-build
# La URL del audio-service se INCRUSTA en el bundle del navegador en build
# (NEXT_PUBLIC_*). Es el puerto que ve el navegador en el host, no el de la red
# interna de compose.
ARG NEXT_PUBLIC_AUDIO_SERVICE_URL=http://localhost:4001
ENV NEXT_PUBLIC_AUDIO_SERVICE_URL=$NEXT_PUBLIC_AUDIO_SERVICE_URL
# `next build` no consulta la base (route handlers force-dynamic), pero el
# cliente pg exige que DATABASE_URL no tenga los valores de ejemplo.
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dispatch?sslmode=disable
RUN npm run build

# ---- web: runtime Next standalone --------------------------------------
FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ---- audio: audio-service (runtime tsx) --------------------------------
FROM source AS audio
ENV NODE_ENV=production PORT=4001
WORKDIR /app/backend
EXPOSE 4001
CMD ["npm", "run", "start"]

# ---- migrate: one-shot migraciones + seed ------------------------------
FROM source AS migrate
WORKDIR /app
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed"]
