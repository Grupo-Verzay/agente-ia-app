#!/usr/bin/env bash
# El banco de «un chat o un lead eliminado no vuelve solo».
#
# Postgres de usar y tirar con el esquema REAL (`prisma db push`) y las
# funciones de PRODUCCION: eliminar un chat (uno a uno y en bloque, con su
# purga), eliminar un lead, lo que guarda un mensaje (`persistChatMessage`, por
# donde pasan el sondeo, la precarga, la importacion de Waha y los envios) y la
# reposicion de fichas que corre al abrir la bandeja.
#
# Corre en DOS modos. En `MODO=roto` el mismo test se empaqueta contra el arbol
# de un commit PINCHADO (sin el arreglo, nunca `origin/main`, que pasa a ser el
# «despues» en cuanto esto se fusione) y AFIRMA el fallo: el chat y el lead
# vuelven. Sin ese modo, lo verde no diria si se arreglo la causa o si el caso
# no se ejerce.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

MODO="${MODO:-bueno}"
# El «antes»: main justo antes del arreglo.
ANTES_REF="${ANTES_REF:-4af691d}"

PGDIR=/tmp/pgchatseliminados
PORT=55571

if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
# Relleno: el paquete arrastra la validacion de entorno del servidor, que no
# decide nada de lo que este banco prueba.
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

# `chat_conversations.profilePicUrl` existe en produccion por un ALTER en
# caliente y NO en el esquema de Prisma: sin ella la bandeja se cae con 42703.
su postgres -c "/usr/lib/postgresql/16/bin/psql -h $PGDIR -p $PORT -U postgres -d banco -c 'ALTER TABLE \"chat_conversations\" ADD COLUMN IF NOT EXISTS \"profilePicUrl\" TEXT;'" >/dev/null 2>&1 || true

OUTDIR="lib/__tests__/.compilado/eliminados"
rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

# El arbol del «antes», DENTRO del repositorio para que sus `import` de paquetes
# encuentren el `node_modules` de aqui.
ANTES_DIR=".banco-antes-eliminados"
RAIZ="$(pwd)"
limpiar() {
  if [ -d "$ANTES_DIR" ]; then
    git worktree remove --force "$ANTES_DIR" >/dev/null 2>&1 || rm -rf "$ANTES_DIR"
  fi
}
trap limpiar EXIT
limpiar

if [ "$MODO" = "roto" ]; then
  git worktree add --detach "$ANTES_DIR" "$ANTES_REF" >/dev/null 2>&1
  RAIZ="$(pwd)/$ANTES_DIR"
  # En el «antes» la regla no existia: es lo primero que se afirma.
  if [ -f "$ANTES_DIR/lib/chats-eliminados.ts" ]; then
    echo "MAL: el «antes» ($ANTES_REF) ya tenia la lapida; el modo roto no reproduciria nada" >&2
    exit 1
  fi
  echo "ok: en el «antes» ($ANTES_REF) no hay lapida de chats eliminados"
fi

# `currentUser`, `revalidatePath` y el `cache()` de React son lo unico que se
# finge: piden una peticion de Next que aqui no existe y no deciden nada de lo
# que se prueba.
npx esbuild lib/__tests__/fingido/entrada-de-eliminados.ts --bundle \
  --platform=node --format=esm --outfile="$OUTDIR/entrada-de-eliminados.js" \
  --alias:@="$RAIZ" \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-borrado.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --external:@prisma/client --external:server-only \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

# `server-only` revienta fuera de Next y aqui no decide nada.
sed -i '/server-only/d' "$OUTDIR/entrada-de-eliminados.js"

PRUEBAS=(lib/__tests__/chats-eliminados-db.test.mjs)
if [ "$MODO" != "roto" ]; then
  npx esbuild lib/chats-eliminados.ts --bundle --platform=node --format=esm \
    --outfile="$OUTDIR/chats-eliminados.js" --log-level=error
  PRUEBAS=(lib/__tests__/chats-eliminados.test.mjs "${PRUEBAS[@]}")
fi

MODO="$MODO" node --test --test-concurrency=1 "${PRUEBAS[@]}" "$@"
