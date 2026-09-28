#!/usr/bin/env bash
# El panel lateral (chat del equipo, copiloto, nota rápida) EMPUJA el contenido
# en todas las pantallas, no solo en Chats y Correo.
#
# Dos mitades:
#
# 1. Sin navegador (`lib/__tests__/panel-fuera-de-chats.test.mjs`): la cuenta de
#    la franja y un barrido del layout, el CSS y los tres marcos.
# 2. En Chromium sobre la página SERVIDA (`scripts/probar-panel-fuera-de-chats.mjs`):
#    Agenda, Tareas, Leads y Panel a 1440/1280/1024 con los tres paneles; que
#    Chats no cambió y que por debajo de 1024 no se reserva nada.
#
# Uso:  scripts/banco-panel-fuera-de-chats.sh     (hace falta `npx next build` antes)
#       MODO=roto  → la mitad pura lee el código de ANTES_REF y AFIRMA el fallo;
#                    la sonda se corre con el `.next` de ese commit
#                    (BUILD_ANTES=<ruta>) y tiene que FALLAR.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export ANTES_REF="${ANTES_REF:-626a48c}"

# ── 1. Sin navegador ─────────────────────────────────────────────────────────
npx tsc lib/panel-lateral.ts --outDir lib/__tests__/.compilado --module es2022 \
  --target es2022 --moduleResolution bundler --skipLibCheck >/dev/null
node --test lib/__tests__/panel-fuera-de-chats.test.mjs

# ── 2. En Chromium, sobre la página servida ──────────────────────────────────
PGDIR=/tmp/pgpanel
PORT=55482
APP=3932

if [ "${MODO:-bueno}" = roto ]; then
  if [ -z "${BUILD_ANTES:-}" ] || [ ! -d "$BUILD_ANTES" ]; then
    echo "MODO=roto necesita BUILD_ANTES=<un .next construido desde $ANTES_REF>" >&2
    exit 1
  fi
  rm -rf .next.bueno && mv .next .next.bueno
  cp -r "$BUILD_ANTES" .next
  trap 'rm -rf .next && mv .next.bueno .next' EXIT
fi

if [ ! -d .next/static/css ]; then
  echo "No hay build: esto mide sobre el servidor del build ('npx next build')." >&2
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
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null
node scripts/sembrar-barra.mjs >/dev/null

# El servidor se levanta aquí y se tumba al salir: el del otro modo no sirve.
pkill -f "next start -p $APP" 2>/dev/null || true
setsid npx next start -p "$APP" >/tmp/banco-panel-next.log 2>&1 </dev/null &
SERVIDOR=$!
trap 'kill -- -'"$SERVIDOR"' 2>/dev/null || true; [ "${MODO:-bueno}" = roto ] && rm -rf .next && mv .next.bueno .next || true' EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

export BASE="http://localhost:$APP"
if [ "${MODO:-bueno}" = roto ]; then
  set +e
  node scripts/probar-panel-fuera-de-chats.mjs
  salida=$?
  set -e
  if [ "$salida" -ne 1 ]; then
    echo "MODO=roto: la sonda salió con $salida — o el panel ya empujaba (este .next no es el de antes) o no se llegó a medir" >&2
    exit 1
  fi
  echo "MODO=roto: reproduce el fallo — fuera de Chats el panel tapa el contenido"
else
  node scripts/probar-panel-fuera-de-chats.mjs
fi
