#!/usr/bin/env bash
# El banco de «una llamada con IA a la vez por número» (ver CLAUDE.md, *La
# llamada con IA no se lanza dos veces*). Contra Postgres (esquema REAL) con
# `startBotCallAction` de verdad y el servidor de llamadas fingido.
#
# `MODO=roto` empaqueta la acción de ANTES (commit pinchado, nunca origin/main)
# y afirma el duplicado: dos llamadas al mismo número y dos filas.
set -euo pipefail
cd "$(dirname "$0")/.."

ANTES_REF="${ANTES_REF:-675dcee}"
MODO="${MODO:-bueno}"
export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
mkdir -p lib/__tests__/.compilado

PGDIR=/tmp/pgllamadaencurso
PORT=55491
if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco
export ASTRACALLS_URL=http://astracalls.banco ASTRACALLS_API_KEY=banco
npx prisma db push --skip-generate --accept-data-loss >/dev/null

ANTES=actions/.banco-voicebot-antes.ts
trap 'rm -f "$ANTES"' EXIT
ALIAS=()
if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:actions/voicebot-actions.ts" > "$ANTES"
  ALIAS=(--alias:@/actions/voicebot-actions=./$ANTES)
fi

npx esbuild lib/__tests__/fingido/entrada-de-llamada-en-curso.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/llamada-en-curso \
  --external:@prisma/client --external:server-only --external:minio \
  --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-llamadas.ts \
  --alias:openai=./lib/__tests__/fingido/openai-de-las-llamadas.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:next/server=./lib/__tests__/fingido/next-server.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  "${ALIAS[@]}" --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/llamada-en-curso/entrada-de-llamada-en-curso.js

echo "── una llamada con IA a la vez por número (MODO=$MODO) ──"
MODO="$MODO" node --test lib/__tests__/llamada-en-curso.test.mjs
