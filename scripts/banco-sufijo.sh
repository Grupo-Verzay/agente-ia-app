#!/usr/bin/env bash
# El banco del sufijo de dispositivo: Postgres de usar y tirar con el esquema
# real (prisma db push) y las funciones de produccion.
#
# El esquema se empuja de verdad porque lo que el fallo original rompia es
# justamente el nombre de las columnas: contra un esquema inventado a mano el
# 42703 no se reproduce.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgsufijo
PORT=55439

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
npx prisma db push --skip-generate --accept-data-loss >/dev/null

npx esbuild lib/__tests__/fingido/entrada-de-sufijo.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/sufijo \
  --external:@prisma/client --external:server-only \
  --log-level=error
# `server-only` revienta fuera de Next y aqui no decide nada: lo que se prueba
# son las consultas, que son las de produccion.
sed -i '/server-only/d' lib/__tests__/.compilado/sufijo/entrada-de-sufijo.js

# Relleno: el paquete arrastra la validacion de entorno del servidor, que no
# decide nada de lo que este banco prueba.
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

node --test lib/__tests__/sufijo-de-dispositivo.test.mjs
