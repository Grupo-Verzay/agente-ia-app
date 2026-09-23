#!/usr/bin/env bash
# El chat de equipo en Chromium, sobre la página SERVIDA (build + `next start`):
# arrastrar la lista de directos, que el orden vuelva al recargar y sea de cada
# persona, y el diálogo de limpiar el historial —solo el súper administrador,
# con la palabra tecleada—. Las reglas y las acciones las prueba
# `scripts/banco-historial-del-equipo.sh`, en dos modos; esto mide lo que solo
# un navegador puede decir. No tiene modo roto: el «antes» serían dos builds.
#
# Uso:  scripts/banco-historial-navegador.sh      (hace falta `npx next build` antes)
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

PGDIR=/tmp/pghistorialweb
PORT=55492
APP=3941

if [ ! -d .next/static/css ]; then
  echo "No hay build: esto mide sobre el servidor del build ('npx next build')." >&2
  exit 1
fi

if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost \
       S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco \
       NEXT_TELEMETRY_DISABLED=1

npx prisma db push --skip-generate --accept-data-loss >/dev/null
node scripts/sembrar-historial.mjs >/dev/null

if ! curl -sf -o /dev/null "http://localhost:$APP/login"; then
  setsid npx next start -p "$APP" >/tmp/banco-historial-next.log 2>&1 </dev/null &
  for _ in $(seq 1 40); do
    curl -sf -o /dev/null "http://localhost:$APP/login" && break
    sleep 1
  done
fi

BASE="http://localhost:$APP" node scripts/probar-historial-navegador.mjs
