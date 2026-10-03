#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Mis tareas (`/guia/tareas`). Mismo estándar
# que las demás guías, y las mismas piezas:
#
#   1. `lib/__tests__/guia-tareas.test.mjs`: la guía documenta EXACTAMENTE las
#      vistas, las cifras, los grupos de la lista, las columnas del Kanban, las
#      acciones de una automatización, los campos de crear y de completar, los
#      resultados y los atajos (leídos del código); lo que se arregló en la
#      pantalla (una regla de «vencida», la fecha propuesta, cancelar y
#      eliminar con confirmación, el título del Kanban); cada captura existe,
#      es pública y sus dos páginas son las de Leads con otro nombre.
#   2. `lib/__tests__/video-guia-tareas.test.mjs`: la narración Cedar, el
#      guion (las confirmaciones se cierran con «Volver») y el vídeo medido.
#   3. `miniaturas-guia-leads.test.mjs` con `GUIA=tareas`.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=tareas`: la guía SERVIDA, sin sesión.
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-tareas.sh && npm run build
#
# `MODO=roto` lee ANTES_TAREAS_REF —pinchado, nunca `origin/main`— y afirma
# que no había guía, ni regla común de «vencida», ni confirmación al eliminar.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_TAREAS_REF="${ANTES_TAREAS_REF:-400482e}"

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads informes catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda recordatorios campanas etiquetas conexion chats tareas correo follow-ups multiagenda embudos calificacion reportes proyectos; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-tareas.test.mjs lib/__tests__/video-guia-tareas.test.mjs
  GUIA=tareas ANTES_REF="$ANTES_TAREAS_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

npx esbuild lib/pantalla-de-tareas.ts --bundle --platform=node --format=esm --outfile=lib/__tests__/.compilado/guia-tareas/pantalla-de-tareas.mjs --log-level=warning
node --test lib/__tests__/guia-tareas.test.mjs
node --test lib/__tests__/video-guia-tareas.test.mjs
GUIA=tareas node --test lib/__tests__/miniaturas-guia-leads.test.mjs
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
setsid npx next start -p "$APP" >/tmp/guia-tareas-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/tareas" && break; sleep 1; done
GUIA=tareas BASE="http://localhost:$APP" node scripts/probar-guia.mjs
