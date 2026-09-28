#!/usr/bin/env bash
# La página SERVIDA: el panel de filtros de Chats de una madre con dos hijas.
# Necesita el build (`npx next build`) y el paquete del banco que deja
# `banco-filtro-de-chats.sh`. `MODO=roto` con `BUILD_ANTES=<.next de antes>`
# afirma el fallo: sin cuenta que elegir y sin embudos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
PGDIR=/tmp/pgfiltrochats
PORT=55493
APP=3932

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost \
       S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco NEXT_TELEMETRY_DISABLED=1

psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null
export CUENTAS="$(node scripts/sembrar-filtro-de-chats.mjs 2>/dev/null | tail -1)"

pkill -f "next start -p $APP" 2>/dev/null || true
sleep 1
setsid npx next start -p "$APP" >/tmp/banco-filtro-next.log 2>&1 </dev/null &
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

export BASE="http://localhost:$APP"
if [ "${MODO:-bueno}" = roto ]; then
  if node scripts/probar-filtro-de-chats.mjs; then
    echo "MODO=roto: el panel salió bien — este .next no es el de antes" >&2
    pkill -f "next start -p $APP" || true
    exit 1
  fi
  echo "MODO=roto: reproduce el fallo — sin cuenta que elegir y sin embudos"
else
  node scripts/probar-filtro-de-chats.mjs
fi
pkill -f "next start -p $APP" || true
