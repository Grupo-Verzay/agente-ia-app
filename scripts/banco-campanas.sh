#!/usr/bin/env bash
# El banco de Campañas.
#
# Dos mitades:
#  - **Las reglas** (`campanas.test.mjs`), sin base: variables, pausa y
#    escalonado, qué pasa al editar y desde cuándo se reprograma.
#  - **Las ACCIONES contra Postgres** (`campanas-db.test.mjs`): crear, pausar,
#    reanudar, editar, reintentar, el historial y eliminar.
#
# Y las dos corren además en `MODO=roto`, contra `ANTES_REF` —pinchado a un
# commit, nunca `origin/main`—, y AFIRMAN los fallos de antes.
#
# Lo del motor (que el flujo se ejecute y que lo enviado y lo fallido se queden
# como historial) lo prueba `scripts/banco-campana-en-el-motor.sh` en api-webhook.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
ANTES_REF="${ANTES_REF:-400482e}"
export ANTES_REF

PGDIR=/tmp/pgcampanas
PORT=55523
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

OUT=lib/__tests__/.compilado/campanas
mkdir -p "$OUT"
npx esbuild lib/campanas.ts --bundle --platform=node --format=esm --outdir="$OUT" --log-level=error

ANTES_DIR=lib/__tests__/.antes/campanas
trap 'rm -rf "$ANTES_DIR"' EXIT
mkdir -p "$ANTES_DIR/actions"
git show "$ANTES_REF:actions/reminders-actions.ts" > "$ANTES_DIR/actions/reminders-actions.ts"

for ENTRADA in entrada-de-campanas entrada-de-campanas-antes; do
  npx esbuild "lib/__tests__/fingido/$ENTRADA.ts" --bundle \
    --platform=node --format=esm --outfile="$OUT/$ENTRADA.js" \
    --alias:@="$(pwd)" \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --external:@prisma/client --external:server-only \
    --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" \
    --log-level=error
  sed -i '/server-only/d' "$OUT/$ENTRADA.js"
done

node --test --test-concurrency=1 lib/__tests__/campanas.test.mjs lib/__tests__/campanas-db.test.mjs "$@"

echo
echo "── Campañas, con la forma VIEJA (tiene que afirmar los fallos) ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/campanas.test.mjs lib/__tests__/campanas-db.test.mjs
