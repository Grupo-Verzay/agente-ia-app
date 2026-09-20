#!/usr/bin/env bash
# El banco de `salas-de-video-db.ts` contra Postgres de verdad.
#
# Prueba lo que no se puede en memoria: el candado de fila que sostiene el tope
# de cuatro, y que `/reuniones` lista las salas por FAMILIA —la madre ve las de
# sus hijas, una hija solo lo suyo, alguien de fuera ninguna—. Las tablas de las
# salas las crea el propio módulo con `CREATE TABLE IF NOT EXISTS`, como en
# producción, así que aquí no hace falta el esquema de Prisma.
set -euo pipefail
cd /home/user/agente-ia-app

B=/usr/lib/postgresql/16/bin
export PATH="$B:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgsalas
PORT=55442

if [ ! -d "$PGDIR/base" ]; then
  rm -rf "$PGDIR"
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "$B/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "$B/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "$B/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
# Relleno: el paquete arrastra la validación de entorno del servidor, que no
# decide nada de lo que este banco prueba.
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx esbuild lib/salas-de-video-db.ts --bundle --platform=node \
  --format=esm --outdir=lib/__tests__/.compilado/banco \
  --external:@prisma/client --external:server-only --log-level=error
sed -i '/^import "server-only";$/d' lib/__tests__/.compilado/banco/salas-de-video-db.js

node --test lib/__tests__/salas-de-video-db.test.mjs "$@"
