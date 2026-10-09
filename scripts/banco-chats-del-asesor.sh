#!/usr/bin/env bash
# Banco de los chats que «perdía» un asesor al apagar sus interruptores en
# Equipo (contra Postgres, con las acciones de verdad).
#
# Corre dos veces:
#  - normal, con el código de este árbol;
#  - MODO=roto, con el MISMO test empaquetado contra el código de ANTES_REF,
#    pinchado (nunca `origin/main`): ahí AFIRMA que Equipo dejaba al asesor
#    con 0 chats activos al apagar «Sesión».
set -euo pipefail
cd "$(dirname "$0")/.."

# main justo antes de este arreglo (merge del #1207).
ANTES_REF="${ANTES_REF:-121a813}"

export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgchatsdelasesor
PORT=55497
if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
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

npx prisma db push --skip-generate --accept-data-loss >/dev/null

empaquetar() { # $1 = árbol, $2 = salida
  (cd "$1" && npx esbuild lib/__tests__/fingido/entrada-de-chats-del-asesor.ts --bundle \
    --platform=node --format=esm --outdir="$2" --packages=external \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$2/entrada-de-chats-del-asesor.js"
}

SALIDA=$PWD/lib/__tests__/.compilado
empaquetar "$PWD" "$SALIDA/chats-del-asesor"

# El árbol de ANTES. La entrada es de este banco y allí no existe: se copia,
# que no decide nada de lo que se mide.
ANTES=$PWD/lib/__tests__/.antes/chats-del-asesor
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$PWD/node_modules" "$ANTES/node_modules"
cp lib/__tests__/fingido/entrada-de-chats-del-asesor.ts "$ANTES/lib/__tests__/fingido/"
empaquetar "$ANTES" "$SALIDA/chats-del-asesor-antes"
git worktree remove --force "$ANTES"

node --test --test-concurrency=1 lib/__tests__/chats-del-asesor-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar la caída a 0 ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/chats-del-asesor-db.test.mjs "$@"
