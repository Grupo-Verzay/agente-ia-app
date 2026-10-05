#!/usr/bin/env bash
# La prueba REAL del video de Verzy en la videollamada: la App servida con
# `next start`, un Chromium del servidor abriendo la cuenta «Verzay Ventas» y
# el flujo en vivo (`?stream=1`) leído como lo lee la sala, mientras Verzy va a
# Chats y escribe una nota. `probar-video-de-verzy.mjs` cuenta los fotogramas
# DISTINTOS que llegan durante la navegación: una pantalla que se mueve.
#
#   npm run build && scripts/banco-video-de-verzy.sh
#   MODO=roto … contra ANTES_REF: el flujo no existía (sale una foto suelta).
#   FOTOS_EN=<dir> guarda unos fotogramas de muestra.
set -euo pipefail
cd "$(dirname "$0")/.."
ANTES_REF="${ANTES_REF:-8483adb}"
export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgverzy; PORT=55493; APP="${APP:-3953}"
[ -f .next/BUILD_ID ] || { echo "No hay build ('npm run build')." >&2; exit 1; }
CHROMIUM_PATH="${CHROMIUM_PATH:-$(command -v chromium || ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

if [ "${MODO:-}" = "roto" ]; then
  # En ANTES_REF la ruta no tenía flujo: solo una foto por petición.
  if git show "$ANTES_REF:app/api/videollamada/pantalla/route.ts" | grep -q "x-mixed-replace\|stream"; then
    echo "MAL  en $ANTES_REF ya había flujo en vivo"; exit 1
  fi
  echo "ok   en $ANTES_REF la pantalla era una foto (sin flujo en vivo)"; exit 0
fi

if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "dropdb --force -h $PGDIR -p $PORT -U postgres verzy" 2>/dev/null || true
su postgres -c "createdb -h $PGDIR -p $PORT -U postgres verzy"
export DATABASE_URL="postgresql://postgres@localhost:$PORT/verzy?host=$PGDIR" DIRECT_URL="postgresql://postgres@localhost:$PORT/verzy?host=$PGDIR"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost \
       S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco NEXT_TELEMETRY_DISABLED=1
npx prisma db push --skip-generate --accept-data-loss >/dev/null
psql "$DATABASE_URL" -q -c 'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' \
  -c 'ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);' >/dev/null
node scripts/sembrar-barra.mjs >/dev/null
node scripts/sembrar-guia-chats.mjs >/dev/null
IDS="$(node scripts/sembrar-video-de-verzy.mjs | tail -1)"
CUENTA="$(node -e "console.log(JSON.parse(process.argv[1]).cuentaId)" "$IDS")"
CITA="$(node -e "console.log(JSON.parse(process.argv[1]).citaId)" "$IDS")"
FIRMA="$(node -e "const c=require('crypto');console.log(c.createHmac('sha256','banco').update('videollamada:'+process.argv[1]).digest('hex').slice(0,32))" "$CITA")"

LOG=/tmp/verzy-next.log
PORT="$APP" CHROMIUM_PATH="$CHROMIUM_PATH" VERZY_CUENTA_ID="$CUENTA" setsid npx next start -p "$APP" >"$LOG" 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf -o /dev/null "http://127.0.0.1:$APP/login" && break; sleep 1; done

BASE="http://127.0.0.1:$APP" CITA="$CITA" FIRMA="$FIRMA" node scripts/probar-video-de-verzy.mjs || { echo "--- log"; tail -40 "$LOG"; exit 1; }
