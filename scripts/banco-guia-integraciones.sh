#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Integrar URLs (`/guia/integraciones`). Mismo
# estándar que la de Leads, la de Catálogo, la de Diagramas, la de Reuniones y
# la de Mis notas, y las mismas piezas:
#
#   1. `lib/__tests__/guia-integraciones.test.mjs`: la guía documenta
#      EXACTAMENTE los mandos de una fila, los campos de la ventana y el orden
#      de las pestañas en Chats (leídos del código), cada captura existe, es
#      pública y no indexable, el código de sus dos páginas es el de Leads con
#      otro nombre, letra por letra, y su tarjeta sale sola en «Tutoriales del
#      módulo» de `/integraciones`.
#   2. `lib/__tests__/video-guia-integraciones.test.mjs`: la narración (Cedar, a
#      ritmo de conversación, la frase de la barra de arriba igual que en
#      Leads), el guion (cada acción en la palabra que la nombra, la grabadora
#      propia, y solo elimina la app que él mismo agregó) y el vídeo publicado,
#      medido como el de Diagramas: sin huecos, acaba con la voz, y la imagen va
#      con la voz.
#   3. `lib/__tests__/miniaturas-guia-leads.test.mjs` con `GUIA=integraciones`:
#      cada tarjeta de Secciones con su enfoque, medido en los píxeles.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías (la
#      tarjeta de «Tutoriales del módulo» la barre además
#      `scripts/banco-tutoriales-del-modulo.sh`).
#   5. `probar-guia.mjs` con `GUIA=integraciones`: la guía SERVIDA, sin sesión y
#      sin base, en Chromium a 390 y 1440 (hace falta el build).
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-integraciones.sh && npm run build
#
# `MODO=roto` lee ANTES_INTEGRACIONES_REF —pinchado a un commit, nunca
# `origin/main`— y afirma que no había guía, ni vídeo, ni narración, ni
# miniaturas de Integrar URLs, ni marcas en la pantalla con las que una receta
# pudiera señalar sus partes. (Lo que se arregló en la propia pantalla lo
# prueba `scripts/banco-integraciones.sh`.)
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_INTEGRACIONES_REF="${ANTES_INTEGRACIONES_REF:-ab6b110}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-integraciones.test.mjs lib/__tests__/video-guia-integraciones.test.mjs
  GUIA=integraciones ANTES_REF="$ANTES_INTEGRACIONES_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda recordatorios etiquetas; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done

node --test lib/__tests__/guia-integraciones.test.mjs
node --test lib/__tests__/video-guia-integraciones.test.mjs
GUIA=integraciones node --test lib/__tests__/miniaturas-guia-leads.test.mjs
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
setsid npx next start -p "$APP" >/tmp/guia-integraciones-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/integraciones" && break; sleep 1; done
GUIA=integraciones BASE="http://localhost:$APP" node scripts/probar-guia.mjs
