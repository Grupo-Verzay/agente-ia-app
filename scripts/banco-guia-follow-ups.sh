#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Follow-ups IA (`/guia/follow-ups`). Mismo
# estándar que las demás guías, y las mismas piezas:
#
#   1. `lib/__tests__/guia-follow-ups.test.mjs`: la guía documenta EXACTAMENTE
#      las pestañas, los pasos de los dos asistentes, los tipos de registro, los
#      campos de la regla de un estado, los botones y la biblioteca (leídos del
#      código), cada captura existe, es pública y no indexable, y sus dos
#      páginas son las de Leads.
#   2. `lib/__tests__/video-guia-follow-ups.test.mjs`: la narración Cedar, el
#      guion y el vídeo publicado, medido.
#   3. `miniaturas-guia-leads.test.mjs` con `GUIA=follow-ups`.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=follow-ups`: la guía SERVIDA (hace falta build).
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-follow-ups.sh && npm run build
#
# `MODO=roto` lee ANTES_FU_REF —pinchado a un commit, nunca `origin/main`— y
# afirma que no había guía, ni vídeo, ni miniaturas, ni marcas en la pantalla.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_FU_REF="${ANTES_FU_REF:-400482e}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-follow-ups.test.mjs lib/__tests__/video-guia-follow-ups.test.mjs
  GUIA=follow-ups ANTES_REF="$ANTES_FU_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda recordatorios campanas etiquetas conexion chats tareas correo follow-ups multiagenda embudos calificacion reportes; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done

node --test lib/__tests__/guia-follow-ups.test.mjs
node --test lib/__tests__/video-guia-follow-ups.test.mjs
GUIA=follow-ups node --test lib/__tests__/miniaturas-guia-leads.test.mjs
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
# Sin base a propósito: la guía no lee nada de ella, así que tiene que
# servirse igual con la base caída.
setsid npx next start -p "$APP" >/tmp/guia-follow-ups-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/follow-ups" && break; sleep 1; done
GUIA=follow-ups BASE="http://localhost:$APP" node scripts/probar-guia.mjs
