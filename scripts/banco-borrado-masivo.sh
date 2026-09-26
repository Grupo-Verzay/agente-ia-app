#!/usr/bin/env bash
# El banco del borrado EN BLOQUE de Chats: ni error de API, ni tope.
#
# Postgres de usar y tirar con el esquema REAL (`prisma db push`) y las funciones
# de PRODUCCION: las acciones en lote, el marcado en bloque, la purga de fondo con
# su barrido, el universo del borrado y la consulta que arma la bandeja.
#
# # Que prueba, y por que contra Postgres
#
# El fallo no esta en ninguna decision: esta en **cuantas transacciones caben a la
# vez**. `bulkDeleteChatsAction` hacia `Promise.all` sobre `hardDeleteLocalChat`
# —una transaccion interactiva por chat— contra un pool de diez conexiones cuyo
# `maxWait` son dos segundos, y pasado ese plazo Prisma se rinde con
#
#     Transaction API error: Unable to start a transaction in the given time.
#
# que es el «error de API» que se ve en pantalla. Eso solo se reproduce con una
# base de verdad y su pool de verdad; contra un doble no existe.
#
# Y el tope que nadie encontraba tampoco es un numero: es que el dialogo contaba
# sobre las filas CARGADAS. Aqui se siembra mas de una pagina de bandeja y se
# comprueba que el servidor cuenta la base entera.
#
# Corre en DOS modos. En `MODO=roto` el borrado en bloque se apunta al commit de
# ANTES (`ANTES_REF`) y el banco **afirma el fallo**: el error de API, y la
# pantalla recibiendo «no se pudieron eliminar» con varios cientos ya borrados.
# Sin ese modo, lo verde no diria si se arreglo la causa o si el caso no se ejerce.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

MODO="${MODO:-bueno}"
# El commit ANTERIOR a este cambio. Pinchado a proposito: `origin/main` deja de
# servir en cuanto esto se fusione (ver la cabecera de la entrada del «antes»).
ANTES_REF="${ANTES_REF:-121e369}"

PGDIR=/tmp/pgborradomasivo
PORT=55471

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

# `chat_conversations.profilePicUrl` existe en produccion por un ALTER en caliente
# y NO en el esquema de Prisma, asi que `db push` no la crea y la consulta de la
# bandeja -que la selecciona- se cae con 42703. Se agrega a mano, como hacen los
# demas bancos que tocan la bandeja.
su postgres -c "/usr/lib/postgresql/16/bin/psql -h $PGDIR -p $PORT -U postgres -d banco -c 'ALTER TABLE \"chat_conversations\" ADD COLUMN IF NOT EXISTS \"profilePicUrl\" TEXT;'" >/dev/null 2>&1 || true

OUTDIR="lib/__tests__/.compilado/masivo"
mkdir -p "$OUTDIR"

ANTES_DIR=".banco-masivo-antes"
ENTRADA="lib/__tests__/fingido/entrada-de-borrado-masivo.ts"
ALIAS_ROTO=""
trap 'rm -rf "$ANTES_DIR"' EXIT
if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_DIR"
  git show "$ANTES_REF:actions/chat-conversation-actions.ts" > "$ANTES_DIR/chat-conversation-actions.ts"
  ALIAS_ROTO="--alias:@/actions/chat-conversation-actions=./$ANTES_DIR/chat-conversation-actions.ts"
  ENTRADA="lib/__tests__/fingido/entrada-de-borrado-masivo-antes.ts"
fi

npx esbuild "$ENTRADA" --bundle \
  --platform=node --format=esm --outfile="$OUTDIR/entrada.js" \
  --alias:@="$(pwd)" \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-borrado.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  $ALIAS_ROTO \
  --external:@prisma/client --external:server-only \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

# `server-only` revienta fuera de Next y aqui no decide nada.
sed -i '/server-only/d' "$OUTDIR/entrada.js"

node --test lib/__tests__/borrado-masivo-de-chats-db.test.mjs "$@"
