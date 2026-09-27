#!/usr/bin/env bash
# El banco del dueño del dato: notas internas, participantes, asignar y tomar
# una conversación, registros, crear y etiquetar leads, el entrenamiento
# maestro, el editor del agente y los pasos de un flujo.
#
# Dos mitades:
#
#  1. **El barrido** (`dueno-del-dato.test.mjs`), sin base: cada acción de los
#     ficheros cerrados pasa por una puerta o dice por qué no. Su `MODO=roto`
#     lee los MISMOS ficheros del commit de antes y afirma los huecos.
#  2. **Las acciones de verdad contra Postgres** (`dueno-del-dato-db.test.mjs`),
#     con `currentUser()` DE VERDAD: solo se finge la petición (sesión y
#     cookies). Su `MODO=roto` empaqueta las MISMAS pruebas contra el código
#     de un commit PINCHADO (`ANTES_REF`) —nunca `origin/main`, que en cuanto
#     esto se fusione pasa a ser el «después»— y AFIRMA la fuga.
set -euo pipefail
cd /home/user/agente-ia-app

# El commit anterior a este cambio (merge del #969).
ANTES_REF="${ANTES_REF:-7575f8a}"
export ANTES_REF

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgdueno
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
# Sin backend: las automatizaciones que se disparan de fondo se quedan sin destino.
unset BACKEND_URL

npx prisma db push --skip-generate --accept-data-loss >/dev/null

empaquetar() { # $1 = árbol, $2 = salida
  (cd "$1" && npx esbuild lib/__tests__/fingido/entrada-del-dueno-del-dato.ts --bundle \
    --platform=node --format=esm --outdir="$2" \
    --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
    --external:@prisma/client --external:server-only \
    --external:googleapis --external:minio --external:sharp \
    --alias:@/auth=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/headers=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:next/navigation=./lib/__tests__/fingido/navegacion-de-servidor.ts \
    --alias:react=./lib/__tests__/fingido/react-con-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$2/entrada-del-dueno-del-dato.js"
}

SALIDA=$PWD/lib/__tests__/.compilado/dueno
empaquetar "$PWD" "$SALIDA"

# El árbol de ANTES, en un worktree pinchado. Los fingidos y la entrada son de
# este banco y no existen allí: se copian, que no deciden nada de lo que se mide.
ANTES=$PWD/lib/__tests__/.antes/dueno
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$PWD/node_modules" "$ANTES/node_modules"
cp lib/__tests__/fingido/sesion-y-cookies.ts lib/__tests__/fingido/entrada-del-dueno-del-dato.ts \
   lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-con-cache.ts \
   lib/__tests__/fingido/navegacion-de-servidor.ts \
   "$ANTES/lib/__tests__/fingido/"
empaquetar "$ANTES" "$PWD/lib/__tests__/.compilado/dueno-antes"
git worktree remove --force "$ANTES"

node --test --test-concurrency=1 lib/__tests__/dueno-del-dato.test.mjs \
            lib/__tests__/dueno-del-dato-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar la fuga ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/dueno-del-dato.test.mjs \
                      lib/__tests__/dueno-del-dato-db.test.mjs
