#!/usr/bin/env bash
# El banco de la PROPUESTA DESDE EL CHAT: el icono del panel lateral de una
# conversación abre «Nueva propuesta» y «Enviar por WhatsApp» la crea en la
# cuenta dueña de la línea y la manda a ESE contacto por ESA línea.
#
# Dos mitades: un barrido del código (el icono en las dos filas de la cabecera,
# el formulario en modo panel, el botón ancho) y las ACCIONES contra Postgres
# con el despachador de WhatsApp fingido.
#
# `MODO=roto` lee el código de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y afirma que no existía nada de esto.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-70273b0}"
export ANTES_REF

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/propuesta-desde-el-chat.test.mjs "$@"
  exit $?
fi

OUT=lib/__tests__/.compilado/propuestas
mkdir -p "$OUT"

PGDIR=/tmp/pgpropuestas
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
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=https://s3.test S3_BUCKET_NAME=verzay-media \
       NEXT_PUBLIC_APP_URL=https://app.test GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

npx esbuild lib/__tests__/fingido/entrada-de-propuestas.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only --external:next/headers \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:@/actions/whatsapp-dispatcher=./lib/__tests__/fingido/despacho-de-propuestas.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-propuestas.js"

node --test lib/__tests__/propuesta-desde-el-chat.test.mjs "$@"
