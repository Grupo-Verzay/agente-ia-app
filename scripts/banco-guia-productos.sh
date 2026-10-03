#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Productos (`/guia/productos`). Mismo estándar
# que la de Leads y Catálogo, y las mismas piezas:
#
#   1. `lib/__tests__/guia-productos.test.mjs`: la guía documenta EXACTAMENTE
#      las columnas, las cifras y los campos de `/products` (leídos del
#      código), cada captura existe, cada sección tiene al menos tres pasos, es
#      pública y no indexable; y las reglas que hubo que arreglar (un producto
#      nuevo nacía agotado, «Sin stock» contaba los de inventario sin límite,
#      el buscador solo miraba el nombre, reordenar con filtro pisaba el resto).
#   2. `lib/__tests__/video-guia-productos.test.mjs`: el vídeo con cursor de
#      verdad, voz Cedar y el MISMO ritmo que Leads, sin borrar nada.
#   3. `miniaturas-guia-leads.test.mjs` con `GUIA=productos`: cada tarjeta con
#      su enfoque, medido en los píxeles.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=productos`: la guía SERVIDA sin sesión, en
#      Chromium a 390 y 1440 (hace falta el build).
#
# `MODO=roto` lee los ficheros de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y afirma que no había guía ni vídeo y los fallos de la pantalla.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_REF="${ANTES_REF:-7767f6f}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-productos.test.mjs lib/__tests__/video-guia-productos.test.mjs
  GUIA=productos node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda recordatorios etiquetas conexion chats tareas correo follow-ups; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done
npx esbuild lib/productos.ts --bundle --platform=node --format=esm \
  --outfile=lib/__tests__/.compilado/guia-productos/productos.mjs --log-level=warning

node --test lib/__tests__/guia-productos.test.mjs
node --test lib/__tests__/video-guia-productos.test.mjs
GUIA=productos node --test lib/__tests__/miniaturas-guia-leads.test.mjs
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
setsid npx next start -p "$APP" >/tmp/guia-productos-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/productos" && break; sleep 1; done
GUIA=productos BASE="http://localhost:$APP" node scripts/probar-guia.mjs
