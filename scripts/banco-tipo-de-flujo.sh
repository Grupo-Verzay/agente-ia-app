#!/usr/bin/env bash
# El banco de cambiar el TIPO de activación de un flujo ya creado (Inicio, IA,
# Flujo, Chatbot):
#
#  - la regla pura y un barrido de la tarjeta (`tipo-de-flujo.test.mjs`);
#  - la ACCIÓN de verdad contra Postgres (`tipo-de-flujo-db.test.mjs`): todas
#    las transiciones, el tipo deducido después es el pedido y no queda nada
#    del viejo, una sola bienvenida, y otra cuenta no puede.
#
# Y corre en MODO=roto contra ANTES_REF, donde se AFIRMA el fallo.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANTES_REF="${ANTES_REF:-75b7e76}"
export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgtipodeflujo
PORT=55497

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
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

OUT=lib/__tests__/.compilado/tipo-de-flujo
mkdir -p "$OUT"

npx esbuild lib/tipo-de-activacion.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" --log-level=error

npx esbuild lib/__tests__/fingido/entrada-de-tipo-de-flujo.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only \
  --external:googleapis --external:minio --external:sharp \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:@/auth=./lib/__tests__/fingido/sesion-y-cookies.ts \
  --alias:next/headers=./lib/__tests__/fingido/sesion-y-cookies.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:next/navigation=./lib/__tests__/fingido/navegacion-de-servidor.ts \
  --alias:react=./lib/__tests__/fingido/react-con-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-tipo-de-flujo.js"

node --test lib/__tests__/tipo-de-flujo.test.mjs lib/__tests__/tipo-de-flujo-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/tipo-de-flujo.test.mjs lib/__tests__/tipo-de-flujo-db.test.mjs
