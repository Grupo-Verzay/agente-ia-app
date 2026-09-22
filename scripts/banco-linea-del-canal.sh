#!/usr/bin/env bash
# El banco de la LÍNEA DEL CANAL: `sendChannelTextAction` y sus hermanas
# (plantillas de Meta, respuestas rápidas, lista y conversación) no dejan
# enviar ni leer por una línea que no sea de la cuenta de quien pide o de una
# que cuelga de ella HACIA ABAJO. Nunca la madre, nunca una hermana, nunca una
# ajena. Y un rechazo no llega al proveedor ni pausa la IA.
#
# Contra Postgres con el esquema REAL (`db push`) y con `currentUser()` DE
# VERDAD: lo único que se finge es la petición (sesión y cookies) y el `fetch`
# hacia el backend, que se cuenta para afirmar si se llegó al proveedor.
#
# Corre dos veces:
#  - **Normal**, con el código de este árbol.
#  - **`MODO=roto`**, con LAS MISMAS pruebas empaquetadas contra el código de
#    ANTES, sacado de un commit PINCHADO (`ANTES_REF`) —nunca `origin/main`,
#    que en cuanto esto se fusione pasa a ser el «después»—. Ahí se AFIRMA la
#    fuga: la hija escribe por la línea de su madre y el backend lo recibe.
set -euo pipefail
cd /home/user/agente-ia-app

# El commit anterior a este cambio (merge del #901).
export ANTES_REF="${ANTES_REF:-f48dbe5}"

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgcanal
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
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco \
       BACKEND_URL=http://backend.banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

empaquetar() { # $1 = árbol, $2 = salida
  (cd "$1" && npx esbuild lib/__tests__/fingido/entrada-del-canal.ts --bundle \
    --platform=node --format=esm --outdir="$2" \
    --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
    --external:@prisma/client --external:server-only \
    --alias:@/auth=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/headers=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-con-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$2/entrada-del-canal.js"
}

SALIDA=$PWD/lib/__tests__/.compilado/canal
npx esbuild lib/linea-del-canal.ts --bundle --platform=node --format=esm \
  --outdir="$SALIDA" --log-level=error
empaquetar "$PWD" "$SALIDA"

ANTES=$PWD/lib/__tests__/.antes/canal
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$PWD/node_modules" "$ANTES/node_modules"
cp lib/__tests__/fingido/sesion-y-cookies.ts lib/__tests__/fingido/entrada-del-canal.ts \
   lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-con-cache.ts \
   "$ANTES/lib/__tests__/fingido/"
empaquetar "$ANTES" "$PWD/lib/__tests__/.compilado/canal-antes"
git worktree remove --force "$ANTES"

node --test --test-concurrency=1 lib/__tests__/linea-del-canal-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar la fuga ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/linea-del-canal-db.test.mjs
