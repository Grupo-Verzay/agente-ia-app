#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Llamadas (`/guia/llamadas`). Mismo estándar
# y mismas piezas que las demás guías:
#
#   1. `lib/__tests__/guia-llamadas.test.mjs`: la guía documenta EXACTAMENTE
#      los filtros, las columnas, los resultados, los botones de llamar, los
#      dos «⋯» y el detalle (leídos del código), cada captura existe, es
#      pública y no indexable, y sus páginas son las de Leads con otro nombre.
#   2. `lib/__tests__/video-guia-llamadas.test.mjs`: la narración Cedar, el
#      guion (no llama a nadie, la carga de Chats no se graba) y el vídeo
#      publicado medido.
#   3. `miniaturas-guia-leads.test.mjs` con `GUIA=llamadas`.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=llamadas`: la guía servida sin sesión.
#
# Regenerar: npm run build && scripts/generar-guia-llamadas.sh && npm run build
#
# `MODO=roto` lee ANTES_LLAMADAS_REF —pinchado— y afirma que no había guía.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_LLAMADAS_REF="${ANTES_LLAMADAS_REF:-2c7b35e}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-llamadas.test.mjs lib/__tests__/video-guia-llamadas.test.mjs
  GUIA=llamadas ANTES_REF="$ANTES_LLAMADAS_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda etiquetas; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done

node --test lib/__tests__/guia-llamadas.test.mjs
node --test lib/__tests__/video-guia-llamadas.test.mjs
GUIA=llamadas node --test lib/__tests__/miniaturas-guia-leads.test.mjs
node --test lib/__tests__/fin-de-la-guia.test.mjs
node --test lib/__tests__/menu-de-la-guia.test.mjs

if [ ! -d .next/static/css ]; then
  echo "(sin build: se salta la mitad del navegador)"; exit 0
fi
APP="${APP:-3946}"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       DATABASE_URL="postgresql://nadie@localhost:1/nada" DIRECT_URL="postgresql://nadie@localhost:1/nada" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco NEXT_TELEMETRY_DISABLED=1
# Sin base a propósito: la guía no lee nada de ella, así que tiene que
# servirse igual con la base caída.
setsid npx next start -p "$APP" >/tmp/guia-llamadas-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/llamadas" && break; sleep 1; done
GUIA=llamadas BASE="http://localhost:$APP" node scripts/probar-guia.mjs
