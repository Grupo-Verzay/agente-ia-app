FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ENV NODE_ENV=production
# Evita OOM al compilar Next en CI/runners con poca RAM.
ENV NODE_OPTIONS=--max-old-space-size=4096

# --- Variables públicas de Meta (Embedded Signup) ---
# Next.js (output: standalone) INCRUSTA las NEXT_PUBLIC_* en el bundle del cliente
# durante `npm run build`. Por eso deben existir AQUÍ (build time), no solo en runtime.
# Se pasan como build-args desde el workflow de CI. Son valores PÚBLICOS (viajan al
# navegador de todos modos); el secreto (META_APP_SECRET) va SOLO en runtime.
ARG NEXT_PUBLIC_META_APP_ID
ARG NEXT_PUBLIC_META_CONFIG_ID
ARG NEXT_PUBLIC_META_GRAPH_VERSION=v21.0
ARG NEXT_PUBLIC_META_FEATURE_TYPE=whatsapp_business_app_onboarding
ENV NEXT_PUBLIC_META_APP_ID=$NEXT_PUBLIC_META_APP_ID
ENV NEXT_PUBLIC_META_CONFIG_ID=$NEXT_PUBLIC_META_CONFIG_ID
ENV NEXT_PUBLIC_META_GRAPH_VERSION=$NEXT_PUBLIC_META_GRAPH_VERSION
ENV NEXT_PUBLIC_META_FEATURE_TYPE=$NEXT_PUBLIC_META_FEATURE_TYPE

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN npm install prisma --no-save
RUN npx prisma generate

EXPOSE 3000

# El frontend NO gestiona el esquema de la BD. El repo BACKEND (api-webhook) es el
# unico duenno de las migraciones y las aplica en su arranque
# ('prisma migrate deploy'). La BD es compartida (una sola _prisma_migrations), asi
# que el frontend NO debe correr ni 'db push' ni 'migrate deploy': solo arranca Node.
# Se quito 'db push --accept-data-loss' que borraba datos en cada despliegue.
# Todo cambio de esquema de aqui en adelante se hace con una migracion en api-webhook.
# Ver docs/db-migrations-ownership.md.
#
# Node arranca DIRECTO, sin `sh` delante.
#
# Con `["sh", "-c", "node server.js"]` el PID 1 era `sh`, y `sh` no cuelga a Node
# en su lugar: lo deja debajo como hijo. Docker manda `SIGTERM` solo al PID 1, y
# el nucleo se lo traga porque ese `sh` no lo atiende (`SigCgt` sin SIGTERM). Node
# ni se enteraba, se agotaban los 10s de gracia y llegaba el `SIGKILL`.
#
# De ahi salia el `exit 137` de cada despliegue, que parecia falta de memoria y no
# lo era: el cgroup dice `oom_kill 0` y el consumo va por el 31% del limite. Ver
# el pendiente del reinicio en CLAUDE.md.
#
# En forma exec Node ES el PID 1, recibe el `SIGTERM` y sale limpio en
# milisegundos en vez de esperar los 10s. No hace falta shell aqui: no hay
# variables que expandir ni tuberias.
CMD ["node", "server.js"]
