#!/usr/bin/env bash
# Banco de «editar los créditos a mano NO adelanta la renovación».
#
# La regla pura y las acciones de verdad contra Postgres. `MODO=roto` corre
# las acciones de ANTES_REF —pinchado a un commit, nunca `origin/main`— y
# AFIRMA el fallo: la fecha quedaba en «ahora» y el motor reponía el cupo.
#
# La otra mitad (que el motor no repone créditos a una cuenta sin pagar) está
# en api-webhook: scripts/banco-creditos-sin-pago.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-a0aa3a6}"

OUT=lib/__tests__/.compilado/creditos-al-editar
mkdir -p "$OUT"
npx esbuild lib/renovacion-al-editar.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --log-level=error

PGDIR=/tmp/pgcreditosaleditar
PORT=55507
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

ENTRADA=entrada-de-creditos-al-editar
ANTES_DIR=lib/__tests__/.antes/creditos-al-editar
trap 'rm -rf "$ANTES_DIR"' EXIT
if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_DIR/actions"
  git show "$ANTES_REF:actions/actions-ia-credits.ts" > "$ANTES_DIR/actions/actions-ia-credits.ts"
  ENTRADA=entrada-de-creditos-al-editar-antes
fi

npx esbuild "lib/__tests__/fingido/$ENTRADA.ts" --bundle \
  --platform=node --format=esm --outfile="$OUT/$ENTRADA.js" \
  --alias:@="$(pwd)" \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-finanzas.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --external:@prisma/client --external:server-only \
  --define:process.env.NODE_ENV='"production"' --log-level=error
sed -i '/server-only/d' "$OUT/$ENTRADA.js"

node --test --test-concurrency=1 lib/__tests__/creditos-al-editar-db.test.mjs "$@"
