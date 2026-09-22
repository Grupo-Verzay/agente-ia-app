#!/usr/bin/env bash
# Los paneles de Chats, en Chromium y sobre la página SERVIDA (ver scripts/probar-paneles-en-chats.mjs).
#
# No una maqueta: el build con `next start` contra un Postgres de usar y tirar,
# con sesión de verdad y una conversación abierta. Lo que caza —un panel que se
# coloca contra la cabecera porque esta lleva `backdrop-blur`— no lo ve ninguna
# maqueta que no monte esa cabecera. La semilla es la del banco de la barra.
#
# Uso:  scripts/banco-paneles-en-chats.sh      (hace falta `npx next build` antes)
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

PGDIR=/tmp/pgbarra
PORT=55481
APP=3931

if [ ! -d .next/static/css ]; then
  echo "No hay build: esto mide sobre el CSS y el servidor del build ('npx next build')." >&2
  exit 1
fi

if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
# Relleno: el paquete arrastra la validación de entorno del servidor, que no
# decide nada de lo que este banco mide.
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost \
       S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco \
       NEXT_TELEMETRY_DISABLED=1

npx prisma db push --skip-generate --accept-data-loss >/dev/null

# `chat_conversations.profilePicUrl` existe en PRODUCCIÓN por un `ALTER TABLE`
# en caliente y **no** en el esquema de Prisma —este documento ya lo tenía
# escrito en la regla del sufijo de dispositivo—. Sin esta línea la bandeja se
# cae con un `42703` y `/chats` abre en mantenimiento: la mitad de Chats de la
# medida no se ejercería y el banco saldría verde habiendo medido una barra.
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null

node scripts/sembrar-barra.mjs >/dev/null

# Una SEGUNDA línea: con una sola el selector de Canales no se pinta
# (`channels.length > 1`) y la comparación de anchos se haría sobre dos de los
# tres paneles de la columna, diciendo que todo cuadra.
psql "$DATABASE_URL" -c "
  INSERT INTO \"Instancias\" (\"instanceName\", display_name, \"userId\", \"instanceId\", \"instanceType\")
  SELECT 'BANCO_ATENCION', 'Atencion', u.id, 'inst-banco-2', 'waha' FROM \"User\" u
  WHERE u.email = 'jefe@banco.test'
    AND NOT EXISTS (SELECT 1 FROM \"Instancias\" WHERE \"instanceName\" = 'BANCO_ATENCION');" >/dev/null

if ! curl -sf -o /dev/null "http://localhost:$APP/login"; then
  setsid npx next start -p "$APP" >/tmp/banco-paneles-next.log 2>&1 </dev/null &
  for _ in $(seq 1 40); do
    curl -sf -o /dev/null "http://localhost:$APP/login" && break
    sleep 1
  done
fi

node scripts/probar-paneles-en-chats.mjs
