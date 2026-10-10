#!/usr/bin/env bash
# Banco del Modo Dueño, Fase 0: las cinco reglas de gobernanza en el servidor.
#
#  1. Lo puro y el barrido (`modo-dueno.test.mjs`): el «sí» estricto, la
#     identidad por número (copia byte a byte del motor) y que ninguna ruta
#     `/api/owner/*` ejecute ni el navegador escriba el historial.
#  2. Las rutas de verdad contra Postgres (`modo-dueno-db.test.mjs`):
#     confirmación persistente, deshacer, bitácora, candados del plan, código
#     de verificación, mover lead sin sesión y restaurar que publica.
#
# `MODO=roto` empaqueta las MISMAS pruebas contra el commit pinchado
# `ANTES_REF` —nunca `origin/main`— y AFIRMA los huecos.
#
# Lo del motor (backend) está en `api-webhook/scripts/banco-modo-dueno.sh`.
set -euo pipefail
cd "$(dirname "$0")/.."

# El commit anterior a este cambio (merge del #1226).
ANTES_REF="${ANTES_REF:-2f3633e}"
export ANTES_REF

export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgmododuenoapp
PORT=55498

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
       OWNER_COMMANDS_KEY=banco
# Sin backend: las automatizaciones que se disparan de fondo se quedan sin destino.
unset BACKEND_URL

npx prisma db push --skip-generate --accept-data-loss >/dev/null

empaquetar() { # $1 = árbol, $2 = entrada, $3 = salida
  (cd "$1" && npx esbuild "lib/__tests__/fingido/$2" --bundle \
    --platform=node --format=esm --outdir="$3" \
    --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
    --external:@prisma/client --external:server-only \
    --alias:next/server=./lib/__tests__/fingido/next-server.ts \
    --external:googleapis --external:minio --external:sharp \
    --alias:@/auth=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/headers=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:next/navigation=./lib/__tests__/fingido/navegacion-de-servidor.ts \
    --alias:react=./lib/__tests__/fingido/react-con-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$3/${2%.ts}.js"
}

COMPILADO=$PWD/lib/__tests__/.compilado
empaquetar "$PWD" puras-del-modo-dueno.ts "$COMPILADO/modo-dueno"
mv "$COMPILADO/modo-dueno/puras-del-modo-dueno.js" "$COMPILADO/modo-dueno/puras.js"
empaquetar "$PWD" entrada-del-modo-dueno.ts "$COMPILADO/modo-dueno"

# El árbol de ANTES, en un worktree pinchado. Los fingidos y la entrada son de
# este banco y no existen allí: se copian, que no deciden nada de lo que se mide.
ANTES=$PWD/lib/__tests__/.antes/modo-dueno
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$PWD/node_modules" "$ANTES/node_modules"
cp lib/__tests__/fingido/sesion-y-cookies.ts lib/__tests__/fingido/entrada-del-modo-dueno-antes.ts \
   lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-con-cache.ts \
   lib/__tests__/fingido/navegacion-de-servidor.ts lib/__tests__/fingido/next-server.ts \
   "$ANTES/lib/__tests__/fingido/"
empaquetar "$ANTES" entrada-del-modo-dueno-antes.ts "$COMPILADO/modo-dueno-antes"
git worktree remove --force "$ANTES"

node --test --test-concurrency=1 lib/__tests__/modo-dueno.test.mjs lib/__tests__/modo-dueno-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar los huecos ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/modo-dueno.test.mjs lib/__tests__/modo-dueno-db.test.mjs "$@"
