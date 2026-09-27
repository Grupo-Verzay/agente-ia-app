#!/usr/bin/env bash
# El banco de «borrar seguimientos de un número solo en SU cuenta» (lado App).
#
#  - la regla pura y un barrido: Descartado y la frase de despedida pasan por
#    `borrarSeguimientosDelNumeroEnLaCuenta` y ninguno borra con el remoteJid a
#    secas (`seguimientos-de-la-cuenta.test.mjs`);
#  - contra Postgres, el mismo número en tres cuentas: cada una borra solo lo
#    suyo (`seguimientos-de-la-cuenta-db.test.mjs`).
#
# `MODO=roto` lee las acciones de ANTES_REF (pinchado a un commit, nunca
# origin/main) y corre el borrado viejo literal: AFIRMA el cruce de cuentas.
# La herramienta «Marcar_Descartado» del agente tiene su banco en
# api-webhook/scripts/banco-seguimientos-de-la-cuenta.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANTES_REF="${ANTES_REF:-22bd5bf}"
export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgseguimientoscuenta
PORT=55511

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

OUT=lib/__tests__/.compilado/seguimientos-de-la-cuenta
mkdir -p "$OUT"
npx esbuild lib/seguimientos-de-la-cuenta.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --log-level=error
npx esbuild lib/__tests__/fingido/entrada-de-seguimientos-de-la-cuenta.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-seguimientos-de-la-cuenta.js"

node --test lib/__tests__/seguimientos-de-la-cuenta.test.mjs \
            lib/__tests__/seguimientos-de-la-cuenta-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/seguimientos-de-la-cuenta.test.mjs \
                      lib/__tests__/seguimientos-de-la-cuenta-db.test.mjs
