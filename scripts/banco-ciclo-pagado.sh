#!/usr/bin/env bash
# El banco del ciclo pagado: «Marcar pagado», «Editar pagos», «Aprobar» y Wompi.
#
# Postgres de usar y tirar con el esquema REAL (`db push`), y las PUERTAS de
# verdad: las acciones y la ruta que recibe el aviso de Wompi. Lo único que se
# finge es quién ha iniciado sesión, el almacén de Next y el `cache()` de React.
#
# Corre dos veces:
#
#  - **Normal**, con el código de este árbol.
#  - **`MODO=roto`**, con el MISMO fichero de pruebas empaquetado contra el
#    código de ANTES, sacado de un commit PINCHADO (`ANTES_REF`) —nunca de
#    `origin/main`, que en cuanto esto se fusione pasa a ser el «después»—. Ahí
#    se AFIRMAN los fallos reportados.
set -euo pipefail
cd /home/user/agente-ia-app

# El commit anterior a este cambio (merge del #975).
ANTES_REF="${ANTES_REF:-d0c374d}"

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgciclopagado
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
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco \
       WOMPI_EVENTS_SECRET=banco-eventos

npx prisma db push --skip-generate --accept-data-loss >/dev/null

empaquetar() { # $1 = árbol, $2 = salida
  (cd "$1" && npx esbuild lib/__tests__/fingido/entrada-del-ciclo-pagado.ts --bundle \
    --platform=node --format=esm --outdir="$2" \
    --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
    --external:@prisma/client --external:server-only \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-con-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$2/entrada-del-ciclo-pagado.js"
}

SALIDA=$PWD/lib/__tests__/.compilado
# Lo puro va aparte y sin fingir nada.
npx esbuild lib/ciclo-pagado.ts --bundle --platform=node --format=esm \
  --outdir="$SALIDA/ciclo-pagado" --log-level=error
empaquetar "$PWD" "$SALIDA/ciclo-pagado"

# El árbol de ANTES, en un worktree pinchado. Los fingidos y la entrada son de
# este banco y no existen allí: se copian, que no deciden nada de lo que se mide.
ANTES=$PWD/lib/__tests__/.antes/ciclo-pagado
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$PWD/node_modules" "$ANTES/node_modules"
mkdir -p "$ANTES/lib/__tests__/fingido"
cp lib/__tests__/fingido/auth-de-documentos.ts lib/__tests__/fingido/entrada-del-ciclo-pagado.ts \
   lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-con-cache.ts \
   "$ANTES/lib/__tests__/fingido/"
empaquetar "$ANTES" "$SALIDA/ciclo-pagado-antes"
git worktree remove --force "$ANTES"

node --test --test-concurrency=1 lib/__tests__/ciclo-pagado.test.mjs \
            lib/__tests__/ciclo-pagado-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar los fallos ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/ciclo-pagado-db.test.mjs
