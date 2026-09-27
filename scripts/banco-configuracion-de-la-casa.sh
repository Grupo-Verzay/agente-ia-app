#!/usr/bin/env bash
# El banco de la configuración de la PLATAFORMA: precios y créditos de los
# planes, ficha de venta, cuentas bancarias, resellers (lista, licencias,
# perfil y qué clientes cuelgan de cada uno) y el selector de clientes de Datos
# externos.
#
#  - lo puro y un BARRIDO del código (`configuracion-de-la-casa.test.mjs`):
#    toda acción de la casa pasa por la puerta, o está en la lista de abiertas
#    con su motivo;
#  - las ACCIONES de verdad contra Postgres (`configuracion-de-la-casa-db.test.mjs`),
#    con `currentUser()` fingido y nada más.
#
# Corre dos veces. La segunda (`MODO=roto`) empaqueta EL MISMO fichero de
# pruebas contra el commit de ANTES (`ANTES_REF`, pinchado: nunca `origin/main`,
# que en cuanto esto se fusione pasa a ser el «después») y AFIRMA los fallos:
# un cliente cambia el precio de un plan y la cuenta bancaria, lee la lista de
# resellers, la pantalla recibe fichas con la contraseña cifrada, un cliente
# queda en dos resellers y el selector de un reseller trae la plataforma entera.
set -euo pipefail
cd "$(dirname "$0")/.."

# El commit anterior a este cambio (merge del #970).
export ANTES_REF="${ANTES_REF:-22bd5bf}"
export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgcasa
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

empaquetar() { # $1 = árbol, $2 = salida
  (cd "$1" && npx esbuild lib/__tests__/fingido/entrada-de-la-casa.ts --bundle \
    --platform=node --format=esm --outdir="$2" \
    --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
    --external:@prisma/client --external:server-only \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$2/entrada-de-la-casa.js"
}

C=$PWD/lib/__tests__/.compilado
npx esbuild lib/__tests__/fingido/entrada-de-la-casa-pura.ts --bundle --platform=node --format=esm \
  --outfile="$C/casa-puro/puro.js" --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts --log-level=error
sed -i '/server-only/d' "$C/casa-puro/puro.js"
empaquetar "$PWD" "$C/casa"

# El árbol de ANTES, en un worktree pinchado. La entrada y los fingidos son de
# este banco y allí no existen (o son más viejos): se copian, que no deciden
# nada de lo que se mide.
ANTES=$PWD/lib/__tests__/.antes/casa
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$PWD/node_modules" "$ANTES/node_modules"
cp lib/__tests__/fingido/entrada-de-la-casa.ts lib/__tests__/fingido/auth-de-documentos.ts \
   lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-cache.ts \
   "$ANTES/lib/__tests__/fingido/"
empaquetar "$ANTES" "$C/casa-antes"
git worktree remove --force "$ANTES"

node --test --test-concurrency=1 lib/__tests__/configuracion-de-la-casa.test.mjs \
            lib/__tests__/configuracion-de-la-casa-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar los fallos ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/configuracion-de-la-casa.test.mjs \
                      lib/__tests__/configuracion-de-la-casa-db.test.mjs
