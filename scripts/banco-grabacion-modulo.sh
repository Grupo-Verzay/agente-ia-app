#!/usr/bin/env bash
# El banco de la puerta del botón de grabar (`laCuentaPuedeGrabar`).
#
# Postgres de usar y tirar + el esquema REAL de Prisma (`db push`): la puerta
# cruza `_UserModules`, `Module`, `ModuleItem` y la familia (`linked_accounts`),
# que son tablas del esquema. Lo que se prueba es que el módulo en la MADRE deja
# grabar en las reuniones de las HIJAS.
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pggrabacion
PORT=55444

if [ ! -d "$PGDIR" ]; then
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
# Relleno: el paquete arrastra la validación de entorno del servidor, que no
# decide nada de lo que este banco prueba.
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

npx esbuild lib/__tests__/fingido/entrada-de-grabacion.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/grabacion \
  --external:@prisma/client --external:server-only --external:minio \
  --log-level=error
# `import "server-only"` no corre fuera de un bundle de Next.
sed -i '/server-only/d' lib/__tests__/.compilado/grabacion/entrada-de-grabacion.js

node --test lib/__tests__/grabacion-modulo-db.test.mjs "$@"
