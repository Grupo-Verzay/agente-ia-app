#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Campañas (`/guia/campanas`).
# Mismo estándar que las demás guías, y las mismas piezas:
#
#   1. `lib/__tests__/guia-campanas.test.mjs`: la guía documenta EXACTAMENTE
#      las vistas, las cifras, las columnas del tablero, los archivos, las
#      variables, los campos de la ventana, el panel de segmentación, las
#      partes de una campaña, su historial, el aviso de riesgo y el «⋯»
#      (leídos del código); cada captura existe, es pública y no indexable, y
#      sus dos páginas son las de Leads con otro nombre, letra por letra.
#   2. `lib/__tests__/video-guia-campanas.test.mjs`: la narración (Cedar, a
#      ritmo de conversación), el guion y el vídeo publicado, medido.
#   3. `miniaturas-guia-leads.test.mjs` con `GUIA=campanas`: cada tarjeta de
#      Secciones con su enfoque, medido en los píxeles.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=campanas`: la guía SERVIDA, sin sesión y
#      sin base, en Chromium a 390 y 1440 (hace falta el build).
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-campanas.sh && npm run build
#
# `MODO=roto` lee ANTES_CAM_REF —pinchado a un commit, nunca `origin/main`— y
# afirma que no había guía, ni vídeo, ni narración, ni miniaturas de Campañas.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_CAM_REF="${ANTES_CAM_REF:-ab6b110}"

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads informes catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda recordatorios campanas etiquetas conexion chats tareas correo follow-ups multiagenda embudos calificacion reportes proyectos; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done
npx esbuild lib/campanas.ts --bundle --platform=node --format=esm --outfile=lib/__tests__/.compilado/guia-campanas/campanas.mjs --log-level=warning

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-campanas.test.mjs lib/__tests__/video-guia-campanas.test.mjs
  GUIA=campanas ANTES_REF="$ANTES_CAM_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

node --test lib/__tests__/guia-campanas.test.mjs
node --test lib/__tests__/video-guia-campanas.test.mjs
GUIA=campanas node --test lib/__tests__/miniaturas-guia-leads.test.mjs
node --test lib/__tests__/fin-de-la-guia.test.mjs
node --test lib/__tests__/menu-de-la-guia.test.mjs

if [ ! -d .next/static/css ]; then
  echo "(sin build: se salta la mitad del navegador)"; exit 0
fi
APP="${APP:-3947}"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       DATABASE_URL="postgresql://nadie@localhost:1/nada" DIRECT_URL="postgresql://nadie@localhost:1/nada" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco NEXT_TELEMETRY_DISABLED=1
# Sin base a propósito: la guía no lee nada de ella.
setsid npx next start -p "$APP" >/tmp/guia-campanas-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/campanas" && break; sleep 1; done
GUIA=campanas BASE="http://localhost:$APP" node scripts/probar-guia.mjs
