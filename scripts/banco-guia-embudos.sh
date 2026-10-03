#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Embudos (`/guia/embudos`). Mismo estándar
# que las demás guías, y las mismas piezas:
#
#   1. `lib/__tests__/guia-embudos.test.mjs`: la guía documenta EXACTAMENTE las
#      etapas del embudo de ventas, las tres del sistema, los mandos de una
#      columna, el «⋯» de la barra y los filtros de asesor (leídos del
#      código); cada captura existe, es pública y sus dos páginas son las de
#      Leads con otro nombre.
#   2. `lib/__tests__/video-guia-embudos.test.mjs`: la narración Cedar, el
#      guion (nada se confirma: vaciar, eliminar y crear se cancelan) y el
#      vídeo medido.
#   3. `miniaturas-guia-leads.test.mjs` con `GUIA=embudos`.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=embudos`: la guía SERVIDA, sin sesión.
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-embudos.sh && npm run build
#
# `MODO=roto` lee ANTES_EMBUDOS_REF —pinchado, nunca `origin/main`— y afirma
# que no había guía, ni su tarjeta en Tutoriales, ni marcas en la pantalla.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_EMBUDOS_REF="${ANTES_EMBUDOS_REF:-84f98e5}"

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda recordatorios campanas etiquetas conexion chats tareas correo follow-ups multiagenda embudos; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-embudos.test.mjs lib/__tests__/video-guia-embudos.test.mjs
  GUIA=embudos ANTES_REF="$ANTES_EMBUDOS_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

node --test lib/__tests__/guia-embudos.test.mjs
node --test lib/__tests__/video-guia-embudos.test.mjs
GUIA=embudos node --test lib/__tests__/miniaturas-guia-leads.test.mjs
node --test lib/__tests__/fin-de-la-guia.test.mjs
node --test lib/__tests__/menu-de-la-guia.test.mjs

if [ ! -d .next/static/css ]; then
  echo "(sin build: se salta la mitad del navegador)"; exit 0
fi
APP="${APP:-3949}"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       DATABASE_URL="postgresql://nadie@localhost:1/nada" DIRECT_URL="postgresql://nadie@localhost:1/nada" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco NEXT_TELEMETRY_DISABLED=1
# Sin base a propósito: la guía no lee nada de ella, así que tiene que
# servirse igual con la base caída.
setsid npx next start -p "$APP" >/tmp/guia-embudos-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/embudos" && break; sleep 1; done
GUIA=embudos BASE="http://localhost:$APP" node scripts/probar-guia.mjs
