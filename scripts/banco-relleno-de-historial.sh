#!/usr/bin/env bash
# El banco del relleno de historial de una linea.
#
# Postgres de usar y tirar con el esquema REAL y las funciones de PRODUCCION
# (`persistChatMessage` escribiendo, la decision, el recorrido con su estado).
# Lo fingido es solo la red: el proveedor devuelve historiales escritos aqui.
#
#   ./scripts/banco-relleno-de-historial.sh            el relleno
#   MODO=roto ./scripts/banco-relleno-de-historial.sh  AFIRMA lo que hace el
#     relleno ingenuo (volver a guardar todo con persistEvolutionMessages):
#     parte la conversacion guardada bajo el @lid y duplica sus mensajes.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgrelleno
PORT=55491

if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"
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
psql -h "$PGDIR" -p "$PORT" -U postgres -d banco -q \
  -c 'ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS "profilePicUrl" text' >/dev/null 2>&1 || true

OUT=lib/__tests__/.compilado/relleno
mkdir -p "$OUT"
npx esbuild lib/__tests__/fingido/entrada-del-relleno.ts --bundle \
  --platform=node --format=esm --outfile="$OUT/entrada-del-relleno.js" \
  --alias:@="$(pwd)" \
  --external:@prisma/client --external:server-only --log-level=error
sed -i '/server-only/d' "$OUT/entrada-del-relleno.js"

node --test lib/__tests__/relleno-de-historial-db.test.mjs
