#!/usr/bin/env bash
# El banco de la línea de WhatsApp por QR (el diálogo del asistente de voz y
# sus hermanas de CRM → Llamadas).
#
# Postgres de usar y tirar + el esquema REAL de Prisma (`db push`): lo que se
# prueba son las acciones, y esas leen `User`, `Instancias` y `Session`, que son
# tablas del esquema.
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgllamadas
PORT=55443

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
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

# `currentUser` es lo ÚNICO que se finge: el de verdad pide next-auth entero y
# no decide nada de lo que se prueba aquí. La regla, la consulta y las cuatro
# acciones son las de producción.
npx esbuild lib/__tests__/fingido/entrada-de-llamadas.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/llamadas \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-llamadas.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/llamadas/entrada-de-llamadas.js

node --test lib/__tests__/linea-de-whatsapp.test.mjs "$@"
