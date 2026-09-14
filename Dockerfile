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
# En que interfaz escucha Next. Sin esto NO se puede tener healthcheck.
#
# El servidor de Next en modo `standalone` escucha en
# `process.env.HOSTNAME || '0.0.0.0'` (linea 9 de su `server.js`), y Docker
# SIEMPRE define `HOSTNAME`, con el id del contenedor. Asi que Next no escuchaba
# en todas las interfaces sino solo en la IP de ese nombre, y cualquier sonda
# contra `127.0.0.1:3000` desde dentro del propio contenedor daba conexion
# rechazada. De ahi que el healthcheck fallara SIEMPRE en produccion y pasara
# en local, donde `HOSTNAME` no es el id de un contenedor.
#
# Poniendolo a `0.0.0.0` -la receta oficial de Next para Docker- Next escucha en
# todas, incluida la que ya usaba. Es estrictamente mas amplio que antes: el
# trafico que hoy entra por la IP del contenedor sigue entrando igual.
#
# Nada del codigo de la App lee esta variable; solo la lee `server.js` de Next.
ENV HOSTNAME=0.0.0.0
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

# NO hay `HEALTHCHECK` aqui, y quitarlo costo una tarde de la App reiniciandose
# en bucle cada 55 segundos.
#
# Se puso uno (`node -e "fetch('http://127.0.0.1:3000/api/health')…"`) para poder
# usar `Order: start-first` con garantias. En local pasaba; en produccion fallaba
# SIEMPRE, y la cuenta cuadra exacta: 25s de `--start-period` + 3 intentos cada
# 10s = 55s, que es justo cada cuanto Swarm mataba la tarea y creaba otra.
#
# El motivo: el servidor de Next en modo `standalone` escucha en
# `process.env.HOSTNAME || '0.0.0.0'` (linea 9 de su `server.js`), y **Docker
# siempre define `HOSTNAME`**, con el id del contenedor. Asi que Next no escucha
# en `0.0.0.0` sino en la IP de ese nombre: `127.0.0.1` da conexion rechazada,
# el healthcheck sale con 1, el contenedor pasa a `unhealthy` y Swarm lo tira.
# Desde fuera se veia una App que se caia sola cada minuto.
#
# Hacian falta DOS cosas, no una:
#
# 1. `ENV HOSTNAME=0.0.0.0` en esta misma etapa. HECHO, arriba, junto a `PORT`.
# 2. Comprobarlo en el contenedor de verdad, no en local: en local `HOSTNAME` no
#    es el id de un contenedor y por eso la prueba local decia que si.
#
# El 2 es lo que falta. Hasta que alguien entre al contenedor que corre y vea
# que `/api/health` contesta desde dentro, el `HEALTHCHECK` sigue SIN ponerse
# aqui: una sonda que no pasa es peor que ninguna, porque Swarm mata tareas
# sanas cada 55 segundos.
#
# Mientras tanto el stack se queda como este, que cuesta ~100 segundos de 502
# por despliegue (ver el pendiente en CLAUDE.md) pero no tira la App.
#
# OJO con el `docker-compose.yml` del repo: ese SI trae un healthcheck contra
# `127.0.0.1` y `order: start-first`, o sea lo que este comentario dice que no
# se puede tener todavia. Es una plantilla y se contradice con esto; el stack
# que corre de verdad se edita en Portainer. No dar por bueno lo que diga ese
# archivo sin mirar el panel.

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
