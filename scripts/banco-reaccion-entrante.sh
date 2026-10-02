#!/usr/bin/env bash
# Banco de «la reaccion que pone el cliente desde WhatsApp se ve en Chats»,
# lado de la App. El lado del backend (guardarla al llegar por el webhook,
# Evolution y Waha) es `api-webhook/scripts/banco-reaccion-entrante.sh`.
#
# Dos mitades:
#   1. La REGLA (lib/reacciones-del-chat.ts) y un BARRIDO: Waha se suscribe a
#      `message.reaction` y el chat abierto repinta una reaccion.
#   2. Contra POSTGRES: lo que trae el sondeo de Evolution se cuelga del
#      mensaje (`raw.reaccion`), sin fila nueva.
#
# `MODO=roto` lee y empaqueta lo de ANTES_REF —pinchado a un commit, nunca
# origin/main— y AFIRMA el fallo: la reaccion se tiraba.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-83159ac}"
export ANTES_REF

OUT=lib/__tests__/.compilado/reaccion
mkdir -p "$OUT"
npx esbuild lib/reacciones-del-chat.ts --bundle --platform=node --format=esm --outdir="$OUT" --log-level=error

PGDIR=/tmp/pgreaccionapp
PORT=55538
if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
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

ENTRADA=entrada-de-la-reaccion
ALIAS=()
ANTES_DIR=lib/__tests__/.antes/reaccion
trap 'rm -rf "$ANTES_DIR"' EXIT
if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_DIR"
  git show "$ANTES_REF:lib/chat-persistence.ts" > "$ANTES_DIR/chat-persistence.ts"
  ALIAS=(--alias:@/lib/chat-persistence=./$ANTES_DIR/chat-persistence.ts)
  cp lib/__tests__/fingido/$ENTRADA.ts lib/__tests__/fingido/$ENTRADA-antes.ts
  trap 'rm -rf "$ANTES_DIR" lib/__tests__/fingido/entrada-de-la-reaccion-antes.ts' EXIT
  ENTRADA=$ENTRADA-antes
fi

npx esbuild "lib/__tests__/fingido/$ENTRADA.ts" --bundle \
  --platform=node --format=esm --outfile="$OUT/$ENTRADA.js" \
  "${ALIAS[@]}" --alias:@="$(pwd)" \
  --external:@prisma/client --external:server-only \
  --define:process.env.NODE_ENV='"production"' --log-level=error
sed -i '/server-only/d' "$OUT/$ENTRADA.js"

node --test --test-concurrency=1 \
  lib/__tests__/reaccion-entrante.test.mjs \
  lib/__tests__/reaccion-entrante-db.test.mjs "$@"
