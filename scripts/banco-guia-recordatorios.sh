#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Recordatorios (`/guia/recordatorios`).
# Mismo estándar que las de Leads, Catálogo, Diagramas, Reuniones, Mis notas y
# Google Sheets, y las mismas piezas:
#
#   1. `lib/__tests__/guia-recordatorios.test.mjs`: la guía documenta
#      EXACTAMENTE las vistas, las cifras, las columnas del tablero, los
#      archivos, las repeticiones, los campos de la ventana, las partes de un
#      recordatorio, su historial y el «⋯» (leídos del código); lo que se
#      arregló en la pantalla (@client_name, la hora del historial, el
#      buscador de flujos); cada captura existe, es pública y no indexable, y
#      sus dos páginas son las de Leads con otro nombre, letra por letra.
#   2. `lib/__tests__/video-guia-recordatorios.test.mjs`: la narración
#      (Cedar, a ritmo de conversación, la frase de la barra de arriba igual
#      que en Leads), el guion (cada acción en la palabra que la nombra, la
#      grabadora propia, la ventana de eliminar se CANCELA) y el vídeo
#      publicado, medido: sin huecos, acaba con la voz, y la imagen va con la
#      voz.
#   3. `lib/__tests__/miniaturas-guia-leads.test.mjs` con
#      `GUIA=recordatorios`: cada tarjeta de Secciones con su enfoque,
#      medido en los píxeles.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=recordatorios`: la guía SERVIDA, sin
#      sesión y sin base, en Chromium a 390 y 1440 (hace falta el build).
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-recordatorios.sh && npm run build
#
# `MODO=roto` lee ANTES_REC_REF —pinchado a un commit, nunca `origin/main`— y
# afirma que no había guía, ni vídeo, ni narración, ni miniaturas de
# Recordatorios, y que el @client_name llegaba tal cual al cliente.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_REC_REF="${ANTES_REC_REF:-ab6b110}"

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads informes catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda recordatorios campanas etiquetas conexion chats tareas correo follow-ups multiagenda embudos calificacion; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done

# La regla de la hora de un recordatorio (la del tablero). En modo roto, la de
# ANTES: leía «06/10/2026» como 10 de junio.
if [ "${MODO:-}" = "roto" ]; then
  git show "${ANTES_REC_REF:-ab6b110}:lib/pendientes-del-menu.ts" > lib/__tests__/.compilado/guia-recordatorios/pendientes-antes.ts
  npx esbuild lib/__tests__/.compilado/guia-recordatorios/pendientes-antes.ts --bundle --platform=node --format=esm --outfile=lib/__tests__/.compilado/guia-recordatorios/pendientes-del-menu.mjs --log-level=warning
else
  npx esbuild lib/pendientes-del-menu.ts --bundle --platform=node --format=esm --outfile=lib/__tests__/.compilado/guia-recordatorios/pendientes-del-menu.mjs --log-level=warning
fi

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-recordatorios.test.mjs lib/__tests__/video-guia-recordatorios.test.mjs
  GUIA=recordatorios ANTES_REF="$ANTES_REC_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

npx esbuild lib/repeticion-del-recordatorio.ts --bundle --platform=node --format=esm --outfile=lib/__tests__/.compilado/guia-recordatorios/repeticion-del-recordatorio.mjs --log-level=warning
node --test lib/__tests__/guia-recordatorios.test.mjs
node --test lib/__tests__/video-guia-recordatorios.test.mjs
GUIA=recordatorios node --test lib/__tests__/miniaturas-guia-leads.test.mjs
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
setsid npx next start -p "$APP" >/tmp/guia-recordatorios-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/recordatorios" && break; sleep 1; done
GUIA=recordatorios BASE="http://localhost:$APP" node scripts/probar-guia.mjs
