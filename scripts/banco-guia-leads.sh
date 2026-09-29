#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Leads (`/guia/leads`). Dos mitades:
#
#   1. `lib/__tests__/guia-leads.test.mjs`: la guía documenta EXACTAMENTE las
#      columnas, los contadores y el CSV que pinta la pantalla (leídos del
#      código), cada captura existe y la ruta es pública y no indexable.
#   2. `lib/__tests__/video-guia-leads.test.mjs`: el vídeo lleva el cursor de
#      verdad (flecha, manito, «I») sin adornos, y narración que se oye.
#   3. `probar-guia-leads.mjs`: la guía SERVIDA, sin sesión, en Chromium a 390
#      y 1440 (hace falta el build).
#
# `MODO=roto` lee los ficheros de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y afirma que no había guía; y ANTES_VIDEO_REF, que el cursor
# era una bolita con halo y el vídeo no tenía audio.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_REF="${ANTES_REF:-73f991f}" ANTES_VIDEO_REF="${ANTES_VIDEO_REF:-153f64f}" ANTES_VOZ_REF="${ANTES_VOZ_REF:-9e38996}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-leads.test.mjs lib/__tests__/video-guia-leads.test.mjs
  exit $?
fi

OUT=lib/__tests__/.compilado/guia-leads
mkdir -p "$OUT"
npx esbuild lib/guia-leads.ts --bundle --platform=node --format=esm --outfile="$OUT/guia-leads.mjs" --log-level=warning
node --test lib/__tests__/guia-leads.test.mjs
node --test lib/__tests__/video-guia-leads.test.mjs

if [ ! -d .next/static/css ]; then
  echo "(sin build: se salta la mitad del navegador)"; exit 0
fi
APP="${APP:-3941}"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       DATABASE_URL="postgresql://nadie@localhost:1/nada" DIRECT_URL="postgresql://nadie@localhost:1/nada" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco NEXT_TELEMETRY_DISABLED=1
# Sin base a propósito: la guía no lee nada de ella, así que tiene que
# servirse igual con la base caída.
setsid npx next start -p "$APP" >/tmp/guia-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/leads" && break; sleep 1; done
BASE="http://localhost:$APP" node scripts/probar-guia-leads.mjs
