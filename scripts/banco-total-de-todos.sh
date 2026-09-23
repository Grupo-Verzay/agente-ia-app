#!/usr/bin/env bash
# El banco del numero de «Todos»: sale de LO MISMO que la lista.
#
# Postgres de usar y tirar con el esquema REAL (`prisma db push`) y las
# funciones de PRODUCCION: la consulta de la lista pagina a pagina, la regla de
# la barra lateral, el conteo del servidor sobre la bandeja entera, resolver y
# reabrir. Varias lineas, historial importado a medias, resueltas, archivadas,
# el mismo contacto en dos lineas y mas de una pagina. Corre en DOS modos: el
# roto lleva el COUNT de leads y el cursor de antes escritos en el test y
# AFIRMA el fallo.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"

PGDIR=/tmp/pgtodos
PORT=55481

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
# Relleno: el paquete arrastra la validacion de entorno del servidor.
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null
# Existe en produccion por un ALTER TABLE en caliente y NO en el esquema de
# Prisma: sin ella la consulta de la bandeja cae con 42703.
psql -h "$PGDIR" -p "$PORT" -U postgres -d banco -q \
  -c 'ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS "profilePicUrl" text' >/dev/null

OUT=lib/__tests__/.compilado/todos
mkdir -p "$OUT"
npx esbuild lib/__tests__/fingido/entrada-de-todos.ts --bundle \
  --platform=node --format=esm --outfile="$OUT/entrada-de-todos.js" \
  --alias:@="$(pwd)" \
  --external:@prisma/client --external:server-only --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-todos.js"

echo "=== MODO BUENO ==="
node --test lib/__tests__/todos-como-la-lista-db.test.mjs
echo
echo "=== MODO ROTO (el COUNT de leads y el cursor en segundos de antes) ==="
MODO=roto node --test lib/__tests__/todos-como-la-lista-db.test.mjs
