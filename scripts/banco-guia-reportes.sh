#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Reportes (`/guia/reportes`). Mismo estándar
# que las demás guías, y las mismas piezas:
#
#   1. `lib/__tests__/guia-reportes.test.mjs`: la guía documenta EXACTAMENTE las
#      pestañas del CRM, los botones de la barra, los bloques y cifras de un
#      reporte, las columnas del Excel, los periodos de «Lo que la IA no supo
#      responder», los tipos, columnas y acciones de Registros y las columnas
#      de Calidad (leídos del código); cada captura existe, es pública y sus
#      dos páginas son las de Leads con otro nombre.
#   2. `lib/__tests__/video-guia-reportes.test.mjs`: la narración Cedar, el
#      guion (la papelera se cierra con «Volver») y el vídeo medido.
#   3. `miniaturas-guia-leads.test.mjs` con `GUIA=reportes`.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=reportes`: la guía SERVIDA, sin sesión.
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-reportes.sh && npm run build
#
# `MODO=roto` lee ANTES_REPORTES_REF —pinchado, nunca `origin/main`— y afirma
# que no había guía ni marcas en la pantalla.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_REPORTES_REF="${ANTES_REPORTES_REF:-84f98e5}"

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads informes catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda recordatorios campanas etiquetas conexion chats tareas correo follow-ups multiagenda embudos calificacion proyectos reportes; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-reportes.test.mjs lib/__tests__/video-guia-reportes.test.mjs
  GUIA=reportes ANTES_REF="$ANTES_REPORTES_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

node --test lib/__tests__/guia-reportes.test.mjs
node --test lib/__tests__/video-guia-reportes.test.mjs
GUIA=reportes node --test lib/__tests__/miniaturas-guia-leads.test.mjs
node --test lib/__tests__/fin-de-la-guia.test.mjs
node --test lib/__tests__/menu-de-la-guia.test.mjs

if [ ! -d .next/static/css ]; then
  echo "(sin build: se salta la mitad del navegador)"; exit 0
fi
APP="${APP:-3948}"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       DATABASE_URL="postgresql://nadie@localhost:1/nada" DIRECT_URL="postgresql://nadie@localhost:1/nada" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco NEXT_TELEMETRY_DISABLED=1
# Sin base a propósito: la guía no lee nada de ella, así que tiene que
# servirse igual con la base caída.
setsid npx next start -p "$APP" >/tmp/guia-reportes-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/reportes" && break; sleep 1; done
GUIA=reportes BASE="http://localhost:$APP" node scripts/probar-guia.mjs
