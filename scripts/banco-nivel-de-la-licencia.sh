#!/usr/bin/env bash
# El banco del nivel de un cliente de reseller: lo da SU LICENCIA.
#
# El caso que lo destapó: «Asesor DAYRA», cliente de Daniel Peralta, consumía
# una licencia de Nivel 6 y estaba en Nivel 5 —sin poder crear usuarios—.
#
# Dos mitades:
#
#  - **La regla y un barrido**, sin base (`nivel-de-la-licencia.test.mjs`): la
#    decisión pura, que el script de los datos decide igual, y que TODOS los
#    sitios que guardan el nivel pasan por ella.
#  - **Las puertas de verdad contra Postgres** (`nivel-de-la-licencia-db.test.mjs`):
#    editar la ficha, crear un cliente, elegir plan para pagar, aprobar una
#    suscripción, y el script que corrige los datos que ya estaban.
#
# Corre dos veces: normal, y `MODO=roto` con el MISMO fichero de pruebas
# empaquetado contra el código de un commit PINCHADO (`ANTES_REF`) —nunca
# `origin/main`, que en cuanto esto se fusione pasa a ser el «después»—. Ahí se
# AFIRMAN los fallos.
set -euo pipefail
cd /home/user/agente-ia-app

# El commit anterior a este cambio (merge del #1079).
export ANTES_REF="${ANTES_REF:-c902542}"

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgnivellicencia
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

empaquetar() { # $1 = árbol, $2 = salida
  (cd "$1" && npx esbuild lib/__tests__/fingido/entrada-del-nivel-de-la-licencia.ts --bundle \
    --platform=node --format=esm --outdir="$2" \
    --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
    --external:@prisma/client --external:server-only \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-con-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$2/entrada-del-nivel-de-la-licencia.js"
}

SALIDA=$PWD/lib/__tests__/.compilado
# Lo puro va aparte y sin fingir nada.
npx esbuild lib/nivel-de-la-licencia.ts --bundle --platform=node --format=esm \
  --outdir="$SALIDA/nivel-de-la-licencia" --log-level=error
empaquetar "$PWD" "$SALIDA/nivel-de-la-licencia"

# El árbol de ANTES, en un worktree pinchado. Los fingidos y la entrada son de
# este banco y no existen allí: se copian, que no deciden nada de lo que se mide.
ANTES=$PWD/lib/__tests__/.antes/nivel-de-la-licencia
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$PWD/node_modules" "$ANTES/node_modules"
mkdir -p "$ANTES/lib/__tests__/fingido"
cp lib/__tests__/fingido/auth-de-documentos.ts lib/__tests__/fingido/entrada-del-nivel-de-la-licencia.ts \
   lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-con-cache.ts \
   "$ANTES/lib/__tests__/fingido/"
empaquetar "$ANTES" "$SALIDA/nivel-de-la-licencia-antes"
git worktree remove --force "$ANTES"

node --test --test-concurrency=1 lib/__tests__/nivel-de-la-licencia.test.mjs \
            lib/__tests__/nivel-de-la-licencia-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar los fallos ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/nivel-de-la-licencia.test.mjs \
                                           lib/__tests__/nivel-de-la-licencia-db.test.mjs
