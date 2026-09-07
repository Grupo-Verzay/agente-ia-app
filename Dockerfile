FROM node:22-bookworm-slim AS base
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

FROM node:22-bookworm-slim AS runner
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

# Senal de vida, para que Swarm sepa cuando la instancia NUEVA ya contesta.
#
# Sin esto no se puede usar `Order: start-first` con garantias: Swarm apagaria la
# vieja en cuanto la nueva ARRANCA, que no es lo mismo que cuando esta lista para
# servir. Con el healthcheck, la nueva no cuenta como sana hasta que Next
# responde de verdad, y la vieja no se apaga hasta entonces. Eso es lo que quita
# el minuto y medio de 502 de cada despliegue (ver el pendiente en CLAUDE.md).
#
# Se prueba con `node`, que SIEMPRE esta en esta imagen. Con `curl` o `wget` el
# healthcheck dependeria de un binario que la imagen base puede no traer, y un
# healthcheck que falla por eso es peor que no tenerlo: con `start-first` la
# tarea nueva nunca llegaria a sana y el despliegue se quedaria colgado.
#
# `--start-period` da margen al arranque (Next tarda ~280 ms, pero el contenedor
# entero no) y durante el un fallo NO cuenta como caida.
HEALTHCHECK --interval=10s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

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
