#!/usr/bin/env bash
# El banco de «Quitar de espera»: apagar el sello de «En espera» sin tocar nada
# mas —ni el asignado, ni el estado, ni la IA— y que un motivo nuevo la vuelva a
# encender.
#
# Postgres de usar y tirar con el esquema REAL (`prisma db push`) y las
# funciones de PRODUCCION: la accion nueva (`quitarDeEsperaAction`), el camino
# viejo (`resolveSession`) y el lector del sello por cuenta
# (`obtenerEscaladasDeCuentas`), que es de donde sale el conteo de la bandeja.
#
# `escalated_at` NO esta en `schema.prisma` a proposito (la crea el backend), y
# `obtenerEscaladasDeCuentas`/`quitarSelloDeEscaladoPorSesion` no la crean —solo
# la leen y la limpian, a prueba de que no exista—, asi que aqui se agrega a
# mano tras el `db push`, como el backend en produccion.
#
# Corre en DOS modos. En `MODO=roto` el banco no llama a la accion nueva: llama
# a `resolveSession`, el unico camino que EXISTIA para bajar el sello, y afirma
# el fallo —que apagaba tambien la IA y cerraba la conversacion—. Sin ese modo,
# lo verde del bueno no diria si la accion nueva de verdad conserva el estado o
# si el caso no se ejerce.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

MODO="${MODO:-bueno}"

PGDIR=/tmp/pgquitardeespera
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

# `escalated_at` la crea el backend en produccion; aqui, a mano. `resolved_at`
# se la crea sola `marcarSesionResuelta` la primera vez, pero se agrega tambien
# para que el lector del modo roto no dependa de ese orden.
su postgres -c "/usr/lib/postgresql/16/bin/psql -h $PGDIR -p $PORT -U postgres -d banco -c 'ALTER TABLE \"Session\" ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP(3); ALTER TABLE \"Session\" ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3);'" >/dev/null 2>&1 || true

OUTDIR="lib/__tests__/.compilado/espera"
mkdir -p "$OUTDIR"

# `currentUser`, `revalidatePath`, la inteligencia de la conversacion y el
# auto-sync de Sheets son lo unico que se finge: piden una peticion de Next o
# hablan con servicios de fuera, y no deciden nada de lo que se prueba. La
# accion, la puerta de permisos y el borrado del sello son los de verdad.
npx esbuild lib/__tests__/fingido/entrada-de-espera.ts --bundle \
  --platform=node --format=esm --outfile="$OUTDIR/entrada-de-espera.js" \
  --alias:@="$(pwd)" \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-espera.ts \
  --alias:@/actions/conversation-intelligence-actions=./lib/__tests__/fingido/intel-muda.ts \
  --alias:@/actions/google-sheets-actions=./lib/__tests__/fingido/intel-muda.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --external:@prisma/client --external:server-only \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

# `server-only` revienta fuera de Next y aqui no decide nada.
sed -i '/server-only/d' "$OUTDIR/entrada-de-espera.js"

node --test lib/__tests__/quitar-de-espera-db.test.mjs "$@"
