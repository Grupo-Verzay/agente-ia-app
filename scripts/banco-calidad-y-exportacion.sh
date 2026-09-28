#!/usr/bin/env bash
# El banco de CALIDAD DE CONVERSACIONES (CRM › Calidad) y de la EXPORTACIÓN de
# conversaciones (Chats y Correo).
#
# Dos mitades:
#   1. Las REGLAS y un BARRIDO, sin base: el formato legible, el .zip (abierto
#      con el `zipfile` de Python, un lector que no es el nuestro), la rúbrica
#      y quién usa qué.
#   2. Las ACCIONES y el RUNNER contra Postgres: identidades, alcance, reposo,
#      grupos, cobro y el reparto por asesor.
#
# `MODO=roto` afirma los fallos: las formas ingenuas escritas dentro del banco y
# el código de ANTES_REF (pinchado a un commit, nunca `origin/main`), donde no
# había ni exportación ni calidad.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:$PATH"
MODO="${MODO:-bueno}"
export MODO
export ANTES_REF="${ANTES_REF:-aecdcef}"

OUT=lib/__tests__/.compilado/calidad
mkdir -p "$OUT"
npx esbuild lib/conversacion-legible.ts lib/zip-sencillo.ts lib/calidad-de-conversaciones.ts \
  --bundle --platform=node --format=esm --outdir="$OUT" --log-level=error

PGDIR=/tmp/pgcalidad
PORT=55531
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
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

npx esbuild lib/__tests__/fingido/entrada-de-calidad.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only --external:openai --external:@google/genai --external:sharp \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-calidad.js"

node --test --test-concurrency=1 lib/__tests__/calidad-y-exportacion.test.mjs \
            lib/__tests__/calidad-y-exportacion-db.test.mjs "$@"
