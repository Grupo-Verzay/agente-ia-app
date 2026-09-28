#!/usr/bin/env bash
# El banco de la traducción automática de Chats. Ver la cabecera de
# `lib/__tests__/traduccion-de-chats.test.mjs`.
#
# El lado del motor (en qué idioma CONTESTA la IA) tiene su propio banco:
# `api-webhook/scripts/banco-idioma-del-cliente.sh`.
#
# `MODO=roto` lee el código de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y AFIRMA el fallo.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export ANTES_REF="${ANTES_REF:-97ae916}"

OUT=lib/__tests__/.compilado/traduccion-de-chats
mkdir -p "$OUT"

PGDIR=/tmp/pgtraduccion
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

npx esbuild lib/__tests__/fingido/entrada-de-la-traduccion.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  "--alias:@/app/(root)/ai-chat/helpers/createAiClient=./lib/__tests__/fingido/traductor-de-mentira.ts" \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-la-traduccion.js"

MODO=bueno node --test lib/__tests__/traduccion-de-chats.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/traduccion-de-chats.test.mjs "$@"
