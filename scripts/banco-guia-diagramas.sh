#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Diagramas (`/guia/diagramas`). Mismo estándar
# que la de Leads y la de Catálogo, y las mismas piezas:
#
#   1. `lib/__tests__/guia-diagramas.test.mjs`: la guía documenta EXACTAMENTE
#      lo que pinta la pantalla —los niveles de «Con el equipo», el «⋯» de la
#      tarjeta, los tipos de paso de «Selecciona una acción», las salidas de la
#      Decisión, los controles del lienzo y las barras de un paso y de una nota
#      Idea—, cada captura existe, es pública y no se indexa; y lo que se
#      arregló en el editor al documentarlo sigue arreglado (el diagrama de
#      solo lectura no deja tocar nada, los «+» de la Decisión no se montan, la
#      barra de un paso no tapa su nombre).
#   2. `lib/__tests__/video-guia-diagramas.test.mjs`: el vídeo lleva la voz
#      Cedar con el ritmo de Leads, dura alrededor de un minuto, no tiene
#      huecos ni cola muda, y la imagen va con la voz.
#   3. `lib/__tests__/miniaturas-guia-leads.test.mjs` con `GUIA=diagramas`:
#      cada tarjeta de Secciones con su enfoque, medido en los píxeles.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=diagramas`: la guía SERVIDA, sin sesión y
#      sin base, en Chromium a 390 y 1440 (hace falta el build).
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-diagramas.sh && npm run build
#
# `MODO=roto` lee ANTES_REF —pinchado a un commit, nunca `origin/main`— y
# afirma el fallo: no había guía de Diagramas, ni vídeo, ni miniaturas, el
# editor de solo lectura dejaba escribir y tocar, y los tres «+» de la
# Decisión se montaban.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_REF="${ANTES_REF:-6d8cd4b}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-diagramas.test.mjs lib/__tests__/video-guia-diagramas.test.mjs
  GUIA=diagramas node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads catalogo diagramas reuniones notas google-sheets integraciones agente-ia usuarios respuestas-rapidas; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done
npx esbuild lib/abanico-de-los-mas.ts --bundle --platform=node --format=esm \
  --outfile=lib/__tests__/.compilado/guia-diagramas/abanico-de-los-mas.mjs --log-level=warning

node --test lib/__tests__/guia-diagramas.test.mjs
node --test lib/__tests__/video-guia-diagramas.test.mjs
GUIA=diagramas node --test lib/__tests__/miniaturas-guia-leads.test.mjs
node --test lib/__tests__/fin-de-la-guia.test.mjs
node --test lib/__tests__/menu-de-la-guia.test.mjs

if [ ! -d .next/static/css ]; then
  echo "(sin build: se salta la mitad del navegador)"; exit 0
fi
APP="${APP:-3942}"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       DATABASE_URL="postgresql://nadie@localhost:1/nada" DIRECT_URL="postgresql://nadie@localhost:1/nada" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco NEXT_TELEMETRY_DISABLED=1
# Sin base a propósito: la guía no lee nada de ella, así que tiene que
# servirse igual con la base caída.
setsid npx next start -p "$APP" >/tmp/guia-diagramas-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/diagramas" && break; sleep 1; done
GUIA=diagramas BASE="http://localhost:$APP" node scripts/probar-guia.mjs
