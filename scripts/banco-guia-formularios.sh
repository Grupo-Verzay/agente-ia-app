#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Mis formularios (`/guia/formularios`). Mismo
# estándar que las otras nueve (Leads, Catálogo, Diagramas, Reuniones, Mis notas,
# Google Sheets, Integrar URLs, Agente IA y Usuarios), y las
# mismas piezas:
#
#   1. `lib/__tests__/guia-formularios.test.mjs`: la guía documenta EXACTAMENTE
#      las cifras de la lista, el «⋯» de una tarjeta, los campos de «Nuevo
#      formulario» y de Configuración, las tres tarjetas del editor y su «⋯»,
#      «Nuevo campo» con sus catorce tipos, y las cifras, estados, botones y
#      «⋯» de Registros (leídos del código); cada captura existe, es pública y
#      no indexable, la tarjeta de «Tutoriales del módulo» se registra sola y
#      el código de sus dos páginas es el de Leads con otro nombre.
#   2. `lib/__tests__/video-guia-formularios.test.mjs`: la narración (Cedar, a
#      ritmo de conversación, la frase de la barra de arriba igual que en
#      Leads), el guion (recorre la lista, el editor, el formulario público y
#      Registros, cada acción en la palabra que la nombra) y el vídeo
#      publicado, medido como el de Diagramas: sin huecos, acaba con la voz,
#      y la imagen va con la voz.
#   3. `lib/__tests__/miniaturas-guia-leads.test.mjs` con
#      `GUIA=formularios`: cada tarjeta de Secciones con su enfoque, medido en
#      los píxeles.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=formularios`: la guía SERVIDA, sin sesión
#      y sin base, en Chromium a 390 y 1440 (hace falta el build).
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-formularios.sh && npm run build
#
# `MODO=roto` lee ANTES_FORMULARIOS_REF —pinchado a un commit, nunca
# `origin/main`— y afirma que no había guía, ni vídeo, ni narración, ni
# miniaturas de Mis formularios, ni marcas en la pantalla con las que una
# receta pudiera señalar sus partes. (Lo que se arregló en la propia pantalla
# lo prueba `scripts/banco-formularios.sh`.)
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_FORMULARIOS_REF="${ANTES_FORMULARIOS_REF:-ab6b110}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-formularios.test.mjs lib/__tests__/video-guia-formularios.test.mjs
  GUIA=formularios ANTES_REF="$ANTES_FORMULARIOS_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads catalogo diagramas reuniones notas google-sheets integraciones agente-ia usuarios formularios; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done

node --test lib/__tests__/guia-formularios.test.mjs
node --test lib/__tests__/video-guia-formularios.test.mjs
GUIA=formularios node --test lib/__tests__/miniaturas-guia-leads.test.mjs
node --test lib/__tests__/fin-de-la-guia.test.mjs
node --test lib/__tests__/menu-de-la-guia.test.mjs

if [ ! -d .next/static/css ]; then
  echo "(sin build: se salta la mitad del navegador)"; exit 0
fi
APP="${APP:-3943}"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       DATABASE_URL="postgresql://nadie@localhost:1/nada" DIRECT_URL="postgresql://nadie@localhost:1/nada" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco NEXT_TELEMETRY_DISABLED=1
# Sin base a propósito: la guía no lee nada de ella, así que tiene que
# servirse igual con la base caída.
setsid npx next start -p "$APP" >/tmp/guia-formularios-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/formularios" && break; sleep 1; done
GUIA=formularios BASE="http://localhost:$APP" node scripts/probar-guia.mjs
