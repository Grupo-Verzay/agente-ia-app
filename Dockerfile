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

# La señal de vida, que es lo que permite `Order: start-first` en el stack.
#
# Sin ella Swarm apaga la tarea vieja en cuanto la nueva ARRANCA, que no es lo
# mismo que cuando esta lista para contestar. Con ella, la vieja aguanta hasta
# que la nueva contesta de verdad.
#
# ## Esto ya salio caro una vez, y por que ahora si
#
# El primer intento tiraba la App en bucle cada 55 segundos, y la cuenta cuadra
# exacta: 25s de `--start-period` + 3 intentos cada 10s. El motivo era que el
# servidor de Next en `standalone` escucha en `process.env.HOSTNAME || '0.0.0.0'`
# (linea 9 de su `server.js`) y **Docker siempre define `HOSTNAME`**, con el id
# del contenedor: Next no escuchaba en todas las interfaces sino solo en la IP de
# ese nombre, asi que `127.0.0.1` daba conexion rechazada, la sonda salia con 1 y
# Swarm mataba una tarea perfectamente sana.
#
# Hacian falta DOS cosas y solo estaba una. Ahora estan las dos:
#
# 1. `ENV HOSTNAME=0.0.0.0`, arriba junto a `PORT`.
# 2. Reproducido, no supuesto. Arrancando el `server.js` real con `HOSTNAME`
#    apuntando a una IP distinta de `127.0.0.1` -que es lo que hace Docker- la
#    sonda da **conexion rechazada** con la App viva; con `HOSTNAME=0.0.0.0`
#    contestan `127.0.0.1`, `0.0.0.0` **y el nombre del contenedor**, las tres
#    con 200. Esto ultimo es lo que importa: es estrictamente mas amplio que
#    antes, asi que el trafico que hoy entra por la IP del contenedor sigue
#    entrando igual.
#
# ## Los numeros, y por que estos
#
# El hilo de Node es UNO. Una consulta pesada bloquea el bucle de eventos y
# durante ese rato `/api/health` tampoco contesta, aunque la App este bien: se
# han medido parones de 25 segundos. Por eso la sonda es **tolerante**: hacen
# falta 6 fallos seguidos, o sea mas de un minuto sin dar señales, para que
# Swarm de la tarea por muerta. Matar un contenedor ocupado seria convertir una
# lentitud pasajera en una caida, que es justo el fallo que se arreglo.
#
# Y el `start-period` de 40s es holgado a proposito: Next arranca en ~280 ms,
# pero mientras dura ese periodo un fallo no cuenta y un acierto SI marca sana.
# O sea que no retrasa nada y cubre un arranque lento.
#
# El puerto se lee de `PORT` en vez de escribirlo a mano: si alguien lo cambia
# arriba y aqui siguiera un 3000 fijo, la sonda fallaria siempre y volveriamos
# al bucle de reinicios.
HEALTHCHECK --interval=10s --timeout=10s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# OJO con el `docker-compose.yml` del repo: es una PLANTILLA -dominio de ejemplo,
# limites distintos, un `pgbouncer` que en produccion no existe-. El stack que
# corre de verdad se edita en Portainer. No dar por bueno lo que diga ese archivo
# sin mirar el panel.

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
