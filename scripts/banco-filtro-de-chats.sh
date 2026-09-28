#!/usr/bin/env bash
# El panel de filtros de Chats: etiquetas y embudos de UNA cuenta.
#
# Tres mitades:
#  - La decisión, pura (`filtro-de-chats-por-cuenta.test.mjs`): de qué cuenta
#    se ofrecen etiquetas y embudos, cuándo hay que elegir cuenta y embudo, y
#    que una etapa filtra exacta, igual que una etiqueta.
#  - La ACCIÓN contra Postgres (`filtro-de-chats-por-cuenta-db.test.mjs`): los
#    embudos de la madre y sus hijas, nunca una ajena ni la madre desde la hija,
#    y la etapa del panel es la misma que la fila pinta.
#  - La página SERVIDA en Chromium (`probar-filtro-de-chats.mjs`), si hay build:
#    elegir la cuenta, sus etiquetas solas, el embudo, la etapa, y la lista
#    filtrada a esas conversaciones exactas.
#
# `MODO=roto` corre lo de antes y AFIRMA el fallo: las etiquetas de las hijas
# mezcladas y ningún filtro de embudos. El «antes» va PINCHADO a un commit
# (`ANTES_REF`), nunca a `origin/main`.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export ANTES_REF="${ANTES_REF:-f3f296c}"
PGDIR=/tmp/pgfiltrochats
PORT=55493

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

OUT=lib/__tests__/.compilado/filtro-de-chats
npx esbuild lib/__tests__/fingido/entrada-del-filtro-de-chats-puro.ts --bundle \
  --platform=node --format=esm --outfile=$OUT/entrada.js --log-level=error
npx esbuild lib/__tests__/fingido/entrada-del-filtro-de-chats.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' $OUT/entrada-del-filtro-de-chats.js

node --test lib/__tests__/filtro-de-chats-por-cuenta.test.mjs \
            lib/__tests__/filtro-de-chats-por-cuenta-db.test.mjs "$@"

echo
echo "── el filtro, con la forma VIEJA (tiene que afirmar el fallo) ──"
MODO=roto node --test lib/__tests__/filtro-de-chats-por-cuenta.test.mjs \
                      lib/__tests__/filtro-de-chats-por-cuenta-db.test.mjs

if [ -d .next/static/css ] && [ "${SIN_NAVEGADOR:-}" != 1 ]; then
  echo
  echo "── la página servida ──"
  bash scripts/banco-filtro-de-chats-navegador.sh
fi
