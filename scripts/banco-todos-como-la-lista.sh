#!/usr/bin/env bash
# «Todos» = lo que enseña la lista, en Chromium y sobre la página SERVIDA, con
# historial importado a medias en dos líneas (ver
# scripts/probar-todos-como-la-lista.mjs). La otra mitad —varias líneas, más de
# una página, agentes— la prueba `banco-total-de-todos.sh` contra Postgres.
#
# Uso:  scripts/banco-todos-como-la-lista.sh    (hace falta `npx next build` antes)
#       MODO=roto con un `.next` construido desde da71f3a (el COUNT de leads):
#       exige que la sonda FALLE — alli «Todos» dice 12 con 9 filas.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

PGDIR=/tmp/pgtodoslista
PORT=55483
APP=3933

if [ ! -d .next/static/css ]; then
  echo "No hay build: esto se mide sobre el servidor del build ('npx next build')." >&2
  exit 1
fi

if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
# Base NUEVA en cada vuelta: la sonda resuelve conversaciones y la siguiente
# tiene que empezar con las cuatro activas.
su postgres -c "dropdb -h $PGDIR -p $PORT -U postgres --if-exists banco" >/dev/null 2>&1 || true
su postgres -c "createdb -h $PGDIR -p $PORT -U postgres banco"

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost \
       S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco \
       NEXT_TELEMETRY_DISABLED=1

npx prisma db push --skip-generate --accept-data-loss >/dev/null
# Existe en producción por un ALTER en caliente y no en schema.prisma: sin ella
# la bandeja se cae con 42703 (ver la regla del sufijo de dispositivo).
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null

node scripts/sembrar-barra.mjs >/dev/null
node scripts/sembrar-todos-importado.mjs >/dev/null

# El servidor se levanta SIEMPRE nuevo: la bandeja cachea unos segundos, y un
# servidor de otra vuelta traería la base anterior.
pkill -f "next start -p $APP" 2>/dev/null || true
setsid npx next start -p "$APP" >/tmp/banco-todos-lista-next.log 2>&1 </dev/null &
SERVIDOR=$!
trap 'kill -- -$SERVIDOR 2>/dev/null || pkill -f "next start -p '"$APP"'" || true' EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

export BASE="http://localhost:$APP"
# En MODO=roto la sonda exige ella misma el fallo: sale con error si todo pasa.
node scripts/probar-todos-como-la-lista.mjs
