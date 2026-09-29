#!/usr/bin/env bash
# El banco de Multiagenda igualada a Agenda: reagendar, aviso al cliente y
# automatizaciones al cambiar el estado de una reserva.
#
#  - La regla y un barrido (`reagendar-reserva.test.mjs`), sin base.
#  - Las ACCIONES contra Postgres (`reagendar-reserva-db.test.mjs`).
#
# Las dos corren además en `MODO=roto` contra `ANTES_REF` —pinchado a un
# commit, nunca `origin/main`, que pasa a ser el «ahora» en cuanto esto se
# fusione— y AFIRMAN el fallo: ni reagendar, ni aviso, ni automatizaciones, y
# cancelar dejaba vivos los recordatorios.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
ANTES_REF="${ANTES_REF:-16e81b7}"
export ANTES_REF

PGDIR=/tmp/pgreagendarreserva
PORT=55517
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
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco \
       BACKEND_URL=http://backend.banco.test

npx prisma db push --skip-generate --accept-data-loss >/dev/null

OUT=lib/__tests__/.compilado/reagendar-reserva
mkdir -p "$OUT"
npx esbuild lib/recordatorios-de-la-reserva.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --alias:@="$(pwd)" --log-level=error

ANTES_DIR=lib/__tests__/.antes/reagendar-reserva
trap 'rm -rf "$ANTES_DIR"' EXIT
mkdir -p "$ANTES_DIR/actions"
git show "$ANTES_REF:actions/bookings-actions.ts" \
  | sed "s#from '\./#from '@/actions/#g" > "$ANTES_DIR/actions/bookings-actions.ts"

for ENTRADA in entrada-de-reagendar-reserva entrada-de-reagendar-reserva-antes; do
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

node --test --test-concurrency=1 lib/__tests__/reagendar-reserva.test.mjs \
            lib/__tests__/reagendar-reserva-db.test.mjs "$@"

echo
echo "── Multiagenda, con la forma VIEJA (tiene que afirmar el fallo) ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/reagendar-reserva.test.mjs \
                      lib/__tests__/reagendar-reserva-db.test.mjs
