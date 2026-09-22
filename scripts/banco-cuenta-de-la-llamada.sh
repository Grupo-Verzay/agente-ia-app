#!/usr/bin/env bash
# El banco de «la llamada es de la cuenta DUEÑA de la conversación».
#
# Estando la madre en una conversación de Verzay Ventas y llamando —con IA o a
# mano—, la llamada salía con el número de la madre, cobraba a la madre y se
# registraba en la madre. Esto prueba las acciones de verdad contra Postgres
# (esquema REAL, `db push`) con una familia sembrada.
#
# Corre dos veces:
#  - **Normal**, con el código de este árbol.
#  - **Con el código de ANTES**, el MISMO fichero de pruebas empaquetado contra
#    un commit PINCHADO (`ANTES_REF`) —nunca `origin/main`, que en cuanto esto se
#    fusione pasa a ser el «después»—. Ahí se AFIRMA el fallo.
set -euo pipefail
cd /home/user/agente-ia-app

# El commit anterior a este cambio (merge del #898).
ANTES_REF="${ANTES_REF:-22dd27b}"

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgcuentallamada
PORT=55481

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
# Sin esto las dos acciones de llamar se rinden en su primera línea y el banco
# saldría verde sin haber ejercido nada. El `fetch` lo intercepta el banco.
export ASTRACALLS_URL=http://localhost:1 ASTRACALLS_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

empaquetar() { # $1 = árbol, $2 = salida
  (cd "$1" && npx esbuild lib/__tests__/fingido/entrada-de-la-cuenta-de-la-llamada.ts --bundle \
    --platform=node --format=esm --outdir="$2" \
    --external:@prisma/client --external:server-only --external:minio \
    --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-llamadas.ts \
    --alias:openai=./lib/__tests__/fingido/openai-de-mentira.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:next/server=./lib/__tests__/fingido/next-server.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$2/entrada-de-la-cuenta-de-la-llamada.js"
}

empaquetar "$PWD" "$PWD/lib/__tests__/.compilado/cuenta-llamada"

# El árbol de ANTES, en un worktree pinchado. Los fingidos y la entrada son de
# este banco y no existen allí: se copian, que no deciden nada de lo que se mide.
ANTES=$PWD/lib/__tests__/.antes/cuenta-llamada
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$PWD/node_modules" "$ANTES/node_modules"
cp lib/__tests__/fingido/entrada-de-la-cuenta-de-la-llamada.ts lib/__tests__/fingido/auth-de-llamadas.ts \
   lib/__tests__/fingido/ia-de-mentira.ts lib/__tests__/fingido/openai-de-mentira.ts \
   lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/next-server.ts \
   lib/__tests__/fingido/react-cache.ts "$ANTES/lib/__tests__/fingido/"
empaquetar "$ANTES" "$PWD/lib/__tests__/.compilado/cuenta-llamada-antes"
git worktree remove --force "$ANTES"

node --test lib/__tests__/cuenta-de-la-llamada.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/cuenta-de-la-llamada.test.mjs
