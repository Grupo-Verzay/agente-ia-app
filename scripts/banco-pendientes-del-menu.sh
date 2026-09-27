#!/usr/bin/env bash
# El numerito de pendientes junto a cada apartado del menú lateral, esté suelto
# o dentro de un módulo: Chats y Correos (sin leer), Agenda y Multiagenda
# (citas pendientes), Mis tareas y Recordatorios (pendientes). Llamadas no.
#
# Dos mitades:
#   1. La REGLA pura y un barrido del menú (`pendientes-del-menu.test.mjs`).
#   2. La ACCIÓN de verdad contra Postgres (`pendientes-del-menu-db.test.mjs`).
# Correos va en el banco de correo (`banco-correo.sh`), que ya finge los tres
# proveedores.
#
# `MODO=roto` lee el menú de `ANTES_REF` —pinchado a un commit, nunca a
# `origin/main`— y AFIRMA el fallo: dentro de un desplegable ningún apartado
# llevaba número, y solo Chats y Mis tareas sueltos, escritos a mano.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
export MODO
# 59f08b4 — antes de esto: sin número en los apartados de un desplegable.
ANTES_REF="${ANTES_REF:-59f08b4}"
export ANTES_REF

OUT=lib/__tests__/.compilado/pendientes-del-menu
mkdir -p "$OUT"
npx esbuild lib/pendientes-del-menu.ts --bundle --platform=node --format=esm --outdir=$OUT --log-level=error

TESTS="lib/__tests__/pendientes-del-menu.test.mjs"
if [ "$MODO" != "roto" ]; then
  PGDIR=/tmp/pgpendientesmenu
  PORT=55619
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
         S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco
  npx prisma db push --skip-generate --accept-data-loss >/dev/null
  npx esbuild lib/__tests__/fingido/entrada-de-pendientes-del-menu.ts --bundle \
    --platform=node --format=esm --outdir=$OUT \
    --external:@prisma/client --external:server-only \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --log-level=error
  TESTS="$TESTS lib/__tests__/pendientes-del-menu-db.test.mjs"
fi
node --test $TESTS
