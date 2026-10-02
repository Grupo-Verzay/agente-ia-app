#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Leads (`/guia/leads`). Dos mitades:
#
#   1. `lib/__tests__/guia-leads.test.mjs`: la guía documenta EXACTAMENTE las
#      columnas, los contadores, el CSV y el menú «⋯» de acciones masivas que
#      pinta la pantalla (leídos del código), cada captura existe y la ruta es
#      pública y no indexable (ANTES_MASIVAS_REF: la guía sin acciones masivas).
#   2. `lib/__tests__/video-guia-leads.test.mjs`: el vídeo lleva el cursor de
#      verdad (flecha, manito, «I») sin adornos, y narración que se oye, con
#      el ritmo de una llamada: sin pausas largas dentro de una frase ni
#      huecos entre frases (ANTES_RITMO_REF: la narración pausada y cortada).
#   2b. `lib/__tests__/fin-de-la-guia.test.mjs`: todo índice de guía termina
#      en la línea divisoria, sin nota interna ni relleno debajo (ANTES_FIN_REF).
#   2c. `lib/__tests__/menu-de-la-guia.test.mjs`: el menú de la izquierda y la
#      barra de arriba salen en las capturas como en la plataforma (cada módulo
#      con su icono) y la guía los nombra, parte por parte (ANTES_MENU_REF).
#   3. `probar-guia.mjs` (`GUIA=leads`): la guía SERVIDA, sin sesión, en Chromium a 390
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
export MODO ANTES_REF="${ANTES_REF:-73f991f}" ANTES_VIDEO_REF="${ANTES_VIDEO_REF:-153f64f}" ANTES_VOZ_REF="${ANTES_VOZ_REF:-9e38996}" ANTES_FIN_REF="${ANTES_FIN_REF:-9e38996}" ANTES_MENU_REF="${ANTES_MENU_REF:-8e41502}" \
       ANTES_MASIVAS_REF="${ANTES_MASIVAS_REF:-c3ae539}" ANTES_RITMO_REF="${ANTES_RITMO_REF:-c3ae539}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-leads.test.mjs lib/__tests__/video-guia-leads.test.mjs lib/__tests__/fin-de-la-guia.test.mjs lib/__tests__/menu-de-la-guia.test.mjs
  exit $?
fi

# Todas las guías se compilan: `menu-de-la-guia` comprueba el marco de todas.
for G in leads catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas flujos; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done
node --test lib/__tests__/guia-leads.test.mjs
node --test lib/__tests__/video-guia-leads.test.mjs
node --test lib/__tests__/fin-de-la-guia.test.mjs
node --test lib/__tests__/menu-de-la-guia.test.mjs

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
GUIA=leads BASE="http://localhost:$APP" node scripts/probar-guia.mjs
