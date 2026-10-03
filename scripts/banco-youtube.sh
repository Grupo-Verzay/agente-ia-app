#!/usr/bin/env bash
# El banco de YOUTUBE: subir un video terminado y dejarlo PROGRAMADO.
#
#   1. Las REGLAS puras (`youtube-reglas.test.mjs`): qué JSON sirve, el sello
#      del permiso, el `state` firmado, el enlace de Google, la fecha en hora de
#      Colombia, los topes de YouTube y cómo se lee un video que quedó sin fecha.
#   2. De PUNTA A PUNTA contra Postgres y un Google de mentira
#      (`youtube-db.test.mjs`): guardar el JSON, autorizar una vez —por el
#      enlace del agente y por la ruta del navegador—, subir a trozos con
#      reanudación, programado de verdad y con su miniatura, sin repetir, y la
#      puerta de las dos rutas. Corre la herramienta de verdad y el conductor del
#      contenedor aquí mismo (`YOUTUBE_CONTENEDOR=local`).
#
# `MODO=roto` lee el árbol de `ANTES_REF` (pinchado, nunca `origin/main`) y
# afirma que no había nada de esto (`youtube-antes.test.mjs`).
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
MODO="${MODO:-bueno}"
export MODO
export ANTES_REF="${ANTES_REF:-64e8f95}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/youtube-antes.test.mjs lib/__tests__/youtube-reglas.test.mjs
  exit 0
fi

PGDIR=/tmp/pgyoutube
PORT=55541
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
export AUTH_SECRET=banco-youtube NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null
node scripts/empaquetar-youtube.mjs

TESTS="lib/__tests__/youtube-reglas.test.mjs lib/__tests__/youtube-db.test.mjs lib/__tests__/youtube-antes.test.mjs"
if [ "$#" -gt 0 ]; then node --test "$@"; else node --test $TESTS; fi
