#!/usr/bin/env bash
# Las TRES columnas de Chats: la lista, la conversación y el panel de la derecha.
#
# Dos mitades:
#
# 1. Sin navegador (`lib/__tests__/columnas-de-chats.test.mjs`): los números
#    de la cabecera del panel, dónde se pone la franja, con qué vista abre el
#    chat del equipo, y un barrido de que los tres marcos lo usan.
# 2. En Chromium sobre la página SERVIDA (`scripts/probar-columnas-de-chats.mjs`):
#    a 1440, 1280 y 1024, con los siete paneles, se miden el alto de las dos
#    filas de cabecera en las tres columnas y su centro, el respiro de arriba,
#    la raya de la cabecera de cada panel, el ancho y el color de los dos
#    separadores, y el chat del equipo en su vista de lista (con 30 canales y
#    30 directos sembrados: la lista se desplaza dentro) y en la de chat.
#
# Uso:  scripts/banco-columnas-de-chats.sh        (hace falta `npx next build` antes)
#       MODO=roto  → la mitad pura lee el código de ANTES_REF y AFIRMA el fallo;
#                    la sonda se corre con un `.next` construido desde ese commit
#                    y tiene que FALLAR.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export ANTES_REF="${ANTES_REF:-20db904}"

# ── 1. Sin navegador ─────────────────────────────────────────────────────────
npx tsc lib/cabeceras-de-chats.ts lib/panel-lateral.ts lib/canales-de-equipo.ts \
  --outDir lib/__tests__/.compilado --module es2022 --target es2022 \
  --moduleResolution bundler --skipLibCheck >/dev/null
node --test lib/__tests__/columnas-de-chats.test.mjs

# ── 2. En Chromium, sobre la página servida ──────────────────────────────────
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
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost \
       S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco \
       NEXT_TELEMETRY_DISABLED=1

npx prisma db push --skip-generate --accept-data-loss >/dev/null
# `profilePicUrl` existe en producción por un ALTER en caliente y no en Prisma:
# sin ella la bandeja se cae con un 42703 y no hay columnas que medir.
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null
node scripts/sembrar-barra.mjs >/dev/null
node scripts/sembrar-equipo-largo.mjs >/dev/null

if ! curl -sf -o /dev/null "http://localhost:$APP/login"; then
  setsid npx next start -p "$APP" >/tmp/banco-columnas-next.log 2>&1 </dev/null &
  for _ in $(seq 1 40); do
    curl -sf -o /dev/null "http://localhost:$APP/login" && break
    sleep 1
  done
fi

if [ "${MODO:-bueno}" = roto ]; then
  # Tiene que fallar la MEDIDA (salida 1), no la sonda (2: no pudo entrar, no
  # encontró la pantalla). Un 2 no reproduce nada.
  set +e
  node scripts/probar-columnas-de-chats.mjs
  salida=$?
  set -e
  if [ "$salida" -ne 1 ]; then
    echo "MODO=roto: la sonda salió con $salida — o las columnas cuadran (este .next no es el de antes) o no se llegó a medir" >&2
    exit 1
  fi
  echo "MODO=roto: reproduce el fallo — el panel sube, su raya cae a otra altura y los separadores no son el mismo"
else
  node scripts/probar-columnas-de-chats.mjs
fi
