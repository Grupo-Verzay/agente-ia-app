#!/usr/bin/env bash
# El banco de USUARIOS (`/equipo`): lo que se arregló al documentar la pantalla.
#
#  - las reglas puras y un barrido del código (`equipo-usuarios.test.mjs`):
#    quién ve «Vincular existente» y «Reiniciar vínculos», que «Mover a otra
#    cuenta» no sale sin destino, que «Permisos» no enseña la ruta interna, que
#    las métricas van acotadas a la cuenta y que «Automaciones» no queda;
#  - las ACCIONES de verdad contra Postgres (`equipo-usuarios-db.test.mjs`),
#    con `currentUser()` DE VERDAD: una cuenta cliente no se apropia de otra
#    escribiendo su correo, la casa sí vincula a su cliente, las métricas
#    cuentan solo lo de la cuenta, «Asignar sin atender» deja pasar a la
#    administradora del equipo y reiniciar los vínculos es solo del súper
#    administrador tecleando LIMPIAR.
#
# Corre dos veces:
#  - **Normal**, con el código de este árbol.
#  - **`MODO=roto`**, con LAS MISMAS pruebas contra el código de ANTES, sacado
#    de un commit PINCHADO (`ANTES_REF`) —nunca `origin/main`, que en cuanto
#    esto se fusione pasa a ser el «después»—. Ahí se AFIRMA cada fallo.
set -euo pipefail
cd "$(dirname "$0")/.."

# El merge del #1056: la pantalla antes de este cambio.
export ANTES_REF="${ANTES_REF:-ab6b110}"

export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgequipousuarios
PORT=55497

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
       BACKEND_URL=http://backend.banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

empaquetar() { # $1 = árbol, $2 = salida
  (cd "$1" && npx esbuild lib/__tests__/fingido/entrada-de-equipo-usuarios.ts --bundle \
    --platform=node --format=esm --outdir="$2" \
    --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
    --external:@prisma/client --external:server-only --external:bcryptjs \
    --alias:@/auth=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/headers=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-con-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$2/entrada-de-equipo-usuarios.js"
}

SALIDA=$PWD/lib/__tests__/.compilado/equipo-usuarios
npx esbuild lib/__tests__/fingido/reglas-de-equipo-usuarios.ts --bundle --platform=node \
  --format=esm --outfile="$SALIDA/reglas.js" --log-level=error
empaquetar "$PWD" "$SALIDA"

ANTES=$PWD/lib/__tests__/.antes/equipo-usuarios
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$PWD/node_modules" "$ANTES/node_modules"
cp lib/__tests__/fingido/sesion-y-cookies.ts lib/__tests__/fingido/entrada-de-equipo-usuarios.ts \
   lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-con-cache.ts \
   "$ANTES/lib/__tests__/fingido/"
empaquetar "$ANTES" "$PWD/lib/__tests__/.compilado/equipo-usuarios-antes"
git worktree remove --force "$ANTES"

node --test --test-concurrency=1 lib/__tests__/equipo-usuarios.test.mjs \
                                 lib/__tests__/equipo-usuarios-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar cada fallo ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/equipo-usuarios.test.mjs \
                                           lib/__tests__/equipo-usuarios-db.test.mjs "$@"
