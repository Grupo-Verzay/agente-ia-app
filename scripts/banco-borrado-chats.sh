#!/usr/bin/env bash
# El banco del borrado de Chats: un chat borrado no vuelve al recargar.
#
# Postgres de usar y tirar con el esquema REAL (`prisma db push`) y las
# funciones de PRODUCCION: el borrado (uno a uno y en bloque), la consulta que
# arma la bandeja y el filtro del navegador. El esquema se empuja de verdad
# porque el fallo vive en como se cruzan las identidades y las marcas entre
# `chat_conversations`, `Session` y `ChatConversationPreference`: contra un
# esquema inventado no se reproduce.
#
# Corre en DOS modos. En `MODO=roto` el borrado y la consulta se apuntan a las
# versiones de `origin/main` (sin el arreglo), asi que el chat vuelve y la marca
# no cubre la otra identidad: el banco lo afirma. Sin ese modo, lo verde no
# diria si se arreglo la causa o si el caso no se ejerce.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

MODO="${MODO:-bueno}"

PGDIR=/tmp/pgborradochats
PORT=55467

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
# caliente y NO en el esquema de Prisma, asi que `db push` no la crea y la
# consulta de la bandeja -que la selecciona- se cae con 42703. Se agrega a mano,
# como hacen los demas bancos que tocan la bandeja.
su postgres -c "/usr/lib/postgresql/16/bin/psql -h $PGDIR -p $PORT -U postgres -d banco -c 'ALTER TABLE \"chat_conversations\" ADD COLUMN IF NOT EXISTS \"profilePicUrl\" TEXT;'" >/dev/null 2>&1 || true

OUTDIR="lib/__tests__/.compilado/borrado"
mkdir -p "$OUTDIR"

# El «antes» sale de `origin/main`, no de una copia escrita aqui.
ANTES_DIR=".banco-borrado-antes"
ALIAS_ROTO=""
trap 'rm -rf "$ANTES_DIR"' EXIT
if [ "$MODO" = "roto" ]; then
  git fetch origin main --quiet 2>/dev/null || true
  mkdir -p "$ANTES_DIR"
  git show "origin/main:actions/chat-conversation-actions.ts" > "$ANTES_DIR/chat-conversation-actions.ts"
  git show "origin/main:lib/chat-persistence.ts" > "$ANTES_DIR/chat-persistence.ts"
  ALIAS_ROTO="--alias:@/actions/chat-conversation-actions=./$ANTES_DIR/chat-conversation-actions.ts --alias:@/lib/chat-persistence=./$ANTES_DIR/chat-persistence.ts"
fi

# `currentUser`, `revalidatePath` y el `cache()` de React son lo unico que se
# finge: piden una peticion de Next que aqui no existe y no deciden nada de lo
# que se prueba.
npx esbuild lib/__tests__/fingido/entrada-de-borrado.ts --bundle \
  --platform=node --format=esm --outfile="$OUTDIR/entrada-de-borrado.js" \
  --alias:@="$(pwd)" \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-borrado.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  $ALIAS_ROTO \
  --external:@prisma/client --external:server-only \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

# `server-only` revienta fuera de Next y aqui no decide nada.
sed -i '/server-only/d' "$OUTDIR/entrada-de-borrado.js"

node --test lib/__tests__/borrado-de-chats-db.test.mjs "$@"
