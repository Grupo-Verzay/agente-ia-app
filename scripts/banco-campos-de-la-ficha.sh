#!/usr/bin/env bash
# El banco de los CAMPOS DE LA FICHA de contacto (Chats › ficha › «Configurar
# campos de la ficha»): guardar pasa por la MISMA puerta que leer
# (`laCuentaDeLaAccion`), así que el administrador de una cuenta guarda la
# ficha de las conversaciones de sus cuentas hijas y nadie guarda hacia arriba.
#
# Las acciones de verdad contra Postgres; lo único fingido es `currentUser()`.
# Corre dos veces: la segunda con `MODO=roto`, que empaqueta la acción de
# `ANTES_REF` (pinchado a un commit, nunca origin/main) y AFIRMA el fallo.
set -euo pipefail
cd "$(dirname "$0")/.."

B=/usr/lib/postgresql/16/bin
PGDIR=/tmp/pgcamposficha
PORT=55548
if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "$B/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "$B/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "$B/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

ANTES_REF="${ANTES_REF:-8e41502}"
empaquetar() { # $1 = carpeta de salida, $2.. = alias extra
  local out="$1"; shift
  mkdir -p "$out"
  npx esbuild lib/__tests__/fingido/entrada-de-campos-de-la-ficha.ts --bundle \
    --platform=node --format=esm --outdir="$out" --out-extension:.js=.mjs \
    --external:@prisma/client --external:server-only --external:openai \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    "$@" \
    "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" \
    --log-level=error
  sed -i '/server-only/d' "$out/entrada-de-campos-de-la-ficha.mjs"
}

empaquetar lib/__tests__/.compilado/campos-de-la-ficha
node --test lib/__tests__/campos-de-la-ficha-db.test.mjs "$@"

echo
echo "── con la acción de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
ANTES=lib/__tests__/fingido/.antes-campos-de-la-ficha.ts
git show "$ANTES_REF:actions/contact-fields-actions.ts" > "$ANTES"
trap 'rm -f "$ANTES"' EXIT
empaquetar lib/__tests__/.compilado/campos-de-la-ficha-antes \
  --alias:@/actions/contact-fields-actions=./$ANTES
MODO=roto node --test lib/__tests__/campos-de-la-ficha-db.test.mjs
