#!/usr/bin/env bash
# El banco de los atajos por línea en Chats: respuestas rápidas y workflows.
#
# Dos mitades:
#  - La decisión, pura (`atajos-de-la-linea.test.mjs`).
#  - Las ACCIONES contra Postgres con el esquema real y `currentUser()` DE
#    VERDAD (`atajos-de-la-linea-db.test.mjs`): lo que ofrece el panel a cada
#    conversación, y lo que el servidor deja mandar por cada línea.
#
# Y las dos otra vez con `MODO=roto`: la pura con la regla de antes y la de
# base empaquetada contra el código de un commit PINCHADO (`ANTES_REF`, nunca
# `origin/main`, que en cuanto esto se fusione pasa a ser el «después»). Ahí se
# AFIRMA el fallo.
set -euo pipefail
cd /home/user/agente-ia-app

# El commit anterior a este cambio (merge del #898).
ANTES_REF="${ANTES_REF:-22dd27b}"

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgatajos
PORT=55491

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
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco \
       BACKEND_URL=http://backend.banco WAHA_URL=http://waha.banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

empaquetar() { # $1 = árbol, $2 = salida
  (cd "$1" && npx esbuild lib/__tests__/fingido/entrada-de-atajos.ts --bundle \
    --platform=node --format=esm --outdir="$2" \
    --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
    --external:@prisma/client --external:server-only \
    --alias:@/auth=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/headers=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-con-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$2/entrada-de-atajos.js"
}

SALIDA=$PWD/lib/__tests__/.compilado/atajos
npx esbuild lib/atajos-de-la-linea.ts --bundle --platform=node --format=esm \
  --outdir="$SALIDA" --log-level=error
empaquetar "$PWD" "$SALIDA"

ANTES=$PWD/lib/__tests__/.antes/atajos
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$PWD/node_modules" "$ANTES/node_modules"
cp lib/__tests__/fingido/sesion-y-cookies.ts lib/__tests__/fingido/entrada-de-atajos.ts \
   lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-con-cache.ts \
   "$ANTES/lib/__tests__/fingido/"
empaquetar "$ANTES" "$PWD/lib/__tests__/.compilado/atajos-antes"
git worktree remove --force "$ANTES"

node --test --test-concurrency=1 lib/__tests__/atajos-de-la-linea.test.mjs \
            lib/__tests__/atajos-de-la-linea-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/atajos-de-la-linea.test.mjs \
                      lib/__tests__/atajos-de-la-linea-db.test.mjs
