#!/usr/bin/env bash
# Banco de la busqueda DENTRO de los mensajes (Chats › buscador).
#   scripts/banco-busqueda-en-mensajes.sh          -> la regla y la consulta de hoy
#   MODO=roto scripts/banco-busqueda-en-mensajes.sh -> afirma que en ANTES_REF no existia
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
MODO="${MODO:-}"
ANTES_REF="${ANTES_REF:-bf1a4af}"

if [ "$MODO" = "roto" ]; then
  ANTES_REF="$ANTES_REF" MODO=roto node --test lib/__tests__/busqueda-en-mensajes.test.mjs
  exit 0
fi

PGDIR=/tmp/pgbusqueda
PORT=55491
OUT=lib/__tests__/.compilado/busqueda
if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/dropdb -h $PGDIR -p $PORT --if-exists --force banco" >/dev/null 2>&1 || true
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT banco"
export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco
export S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco
npx prisma db push --skip-generate --accept-data-loss >/dev/null
psql "$DATABASE_URL" -q -c 'ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS "profilePicUrl" text' >/dev/null 2>&1 || true

mkdir -p "$OUT"
npx esbuild lib/__tests__/fingido/entrada-de-busqueda.ts --bundle --platform=node --format=esm \
  --outfile="$OUT/entrada.mjs" \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-por-persona.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:@="$(pwd)" \
  --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
  --external:@prisma/client --external:server-only --log-level=error
sed -i '/server-only/d' "$OUT/entrada.mjs"

npx esbuild lib/busqueda-en-mensajes.ts --bundle --platform=node --format=esm --outfile="$OUT/puro.mjs" --log-level=error
PURO="$OUT/puro.mjs" node --test lib/__tests__/busqueda-en-mensajes.test.mjs
ENTRADA="$OUT/entrada.mjs" node --test lib/__tests__/busqueda-en-mensajes-db.test.mjs
