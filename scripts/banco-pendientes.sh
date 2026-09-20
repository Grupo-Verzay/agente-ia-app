#!/usr/bin/env bash
# El banco del numero de la pestaña: Postgres de usar y tirar + los dos modos.
#
# El modo viejo reproduce el fallo de partida —la mitad de chats salia del
# store, que solo escribe la bandeja, asi que fuera de Chats valia cero— para
# que lo verde del modo nuevo signifique que se arreglo la causa.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgpend
PORT=55435

if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

npx esbuild lib/__tests__/fingido/entrada-de-pendientes.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/pendientes \
  --external:@prisma/client --external:server-only \
  --log-level=error
# `server-only` revienta fuera de Next y aqui no decide nada: lo que se prueba
# son las consultas, que son las de produccion.
sed -i '/server-only/d' lib/__tests__/.compilado/pendientes/entrada-de-pendientes.js

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
# Relleno: el paquete arrastra la validacion de entorno del servidor, que no
# decide nada de lo que este banco prueba.
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

echo "=== MODO NUEVO ==="
node --test lib/__tests__/pendientes-de-la-pestana-db.test.mjs 2>&1 | tail -14
echo
echo "=== MODO VIEJO (la mitad de chats valia cero) ==="
MODO=viejo node --test lib/__tests__/pendientes-de-la-pestana-db.test.mjs 2>&1 | tail -14
