#!/usr/bin/env bash
# El banco del alcance entre cuentas: «Ingresar», el conmutador,
# `assertCanAccessTargetUser` y las consultas de Leads.
#
# Contra Postgres y con el esquema REAL (`db push`), y con `currentUser()` DE
# VERDAD: lo único que se finge es la petición —quién inició sesión y qué
# cookies trae—, porque lo que se prueba es justo cómo se leen esas cookies.
#
# Corre dos veces:
#
#  - **Normal**, con el código de este árbol: nadie llega hacia arriba ni a
#    una cuenta de superadministrador, y las consultas de Leads comprueban de
#    quién es el dato.
#  - **`MODO=roto`**, con el MISMO fichero de pruebas empaquetado contra el
#    código de ANTES, sacado de un commit PINCHADO (`ANTES_REF`) —nunca de
#    `origin/main`, que en cuanto esto se fusione pasa a ser el «después» y el
#    modo roto dejaría de reproducir nada—. Ahí se AFIRMA la fuga.
set -euo pipefail
cd /home/user/agente-ia-app

# El commit anterior a este cambio (merge del #897).
ANTES_REF="${ANTES_REF:-f482dca}"

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgalcance
PORT=55473

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
  (cd "$1" && npx esbuild lib/__tests__/fingido/entrada-del-alcance.ts --bundle \
    --platform=node --format=esm --outdir="$2" \
    --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
    --external:@prisma/client --external:server-only \
    --alias:@/auth=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/headers=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-con-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$2/entrada-del-alcance.js"
}

SALIDA=$PWD/lib/__tests__/.compilado/alcance
# Lo puro va aparte y sin fingir nada.
npx esbuild lib/alcance-entre-cuentas.ts --bundle --platform=node --format=esm \
  --outdir="$SALIDA" --external:@prisma/client --log-level=error
empaquetar "$PWD" "$SALIDA"

# El árbol de ANTES, en un worktree pinchado. Los fingidos y la entrada son de
# este banco y no existen allí: se copian, que no deciden nada de lo que se mide.
ANTES=$PWD/lib/__tests__/.antes/alcance
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$PWD/node_modules" "$ANTES/node_modules"
cp lib/__tests__/fingido/sesion-y-cookies.ts lib/__tests__/fingido/entrada-del-alcance.ts \
   lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-con-cache.ts \
   "$ANTES/lib/__tests__/fingido/"
empaquetar "$ANTES" "$PWD/lib/__tests__/.compilado/alcance-antes"
git worktree remove --force "$ANTES"

node --test --test-concurrency=1 lib/__tests__/alcance-entre-cuentas.test.mjs \
            lib/__tests__/alcance-entre-cuentas-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar la fuga ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/alcance-entre-cuentas.test.mjs \
                      lib/__tests__/alcance-entre-cuentas-db.test.mjs
