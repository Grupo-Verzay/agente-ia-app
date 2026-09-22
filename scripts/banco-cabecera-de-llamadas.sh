#!/usr/bin/env bash
# CRM › Llamadas contra Leads, sobre las páginas SERVIDAS (ver
# scripts/probar-cabecera-de-llamadas.mjs): el build con `next start` contra un
# Postgres de usar y tirar y con sesión de verdad.
#
# No vale una maqueta: el tamaño de un encabezado lo decide
# `.app-module-content` (globals.css), que solo existe dentro del layout, y el
# reparto del ancho depende del hueco real con el menú lateral.
#
# Uso:  scripts/banco-cabecera-de-llamadas.sh            (hace falta el build)
#       MODO=roto scripts/banco-cabecera-de-llamadas.sh  <- afirma los fallos
#
# `MODO=roto` corre contra el build de ANTES y afirma los fallos. Se le pasa
# en `BUILD_ANTES` (un `.next` construido desde el commit de antes): la tabla
# se pinta en el servidor con su CSS, así que no hay otra forma honesta de
# medir el «antes» que servirlo.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

PGDIR=/tmp/pgbarra
PORT=55481
APP="${APP:-3932}"

MODO="${MODO:-bueno}"
if [ "$MODO" = "roto" ]; then
  if [ -z "${BUILD_ANTES:-}" ] || [ ! -d "$BUILD_ANTES/static/css" ]; then
    echo "MODO=roto necesita BUILD_ANTES=<un .next construido desde el commit de antes>" >&2
    exit 1
  fi
  # Se MUEVE, no se enlaza: con un enlace simbólico el servidor resuelve sus
  # `require` desde la carpeta de fuera y no encuentra `node_modules`.
  BUILD_ANTES="$(cd "$BUILD_ANTES" && pwd)"
  mv .next .next-banco-bueno
  mv "$BUILD_ANTES" .next
fi
devolver_el_build() {
  if [ -d .next-banco-bueno ]; then mv .next "$BUILD_ANTES" && mv .next-banco-bueno .next; fi
}
trap devolver_el_build EXIT

if [ ! -d .next/static/css ]; then
  echo "No hay build ('npx next build')." >&2
  exit 1
fi

if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost \
       S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco \
       NEXT_TELEMETRY_DISABLED=1

npx prisma db push --skip-generate --accept-data-loss >/dev/null
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null
node scripts/sembrar-barra.mjs >/dev/null
node scripts/sembrar-llamadas-como-leads.mjs >/dev/null

LOG=/tmp/banco-cabecera-next.log
setsid npx next start -p "$APP" >"$LOG" 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true; devolver_el_build' EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

BASE="http://localhost:$APP" MODO="$MODO" node ${PROBE:-scripts/probar-cabecera-de-llamadas.mjs}
