#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Catálogo (`/guia/catalogo`). Mismo estándar
# que la de Leads, y las mismas piezas:
#
#   1. `lib/__tests__/guia-catalogo.test.mjs`: la guía documenta EXACTAMENTE
#      los cinco apartados de `/mis-catalogo` y sus campos (leídos del
#      código), cada captura existe, cada sección tiene al menos tres pasos,
#      es pública y no indexable; y lo que hubo que arreglar para documentarla
#      (el catálogo público pedía sesión, el enlace convertía cada tilde en
#      guion y el pie llevaba un dominio escrito a mano).
#   2. `lib/__tests__/video-guia-catalogo.test.mjs`: el vídeo lleva el cursor
#      de verdad y la narración con la voz Cedar y el MISMO ritmo que Leads,
#      cada acción cae en la palabra que la nombra y la imagen no se despega
#      de la voz.
#   3. `lib/__tests__/miniaturas-guia-leads.test.mjs` con `GUIA=catalogo`: cada
#      tarjeta de Secciones con su enfoque (16:9, la zona nítida, el resto
#      atenuado), medido en los píxeles.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=catalogo`: la guía SERVIDA sin sesión, en
#      Chromium a 390 y 1440, y el catálogo público abriendo sin login (hace
#      falta el build).
#
# `MODO=roto` lee los ficheros de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y afirma que no había guía, ni vídeo, ni miniaturas, que el
# catálogo público pedía sesión y que el enlace se escribía mal.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_REF="${ANTES_REF:-24ba0b2}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-catalogo.test.mjs lib/__tests__/video-guia-catalogo.test.mjs
  GUIA=catalogo node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas flujos; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done
npx esbuild lib/enlace-del-catalogo.ts --bundle --platform=node --format=esm \
  --outfile=lib/__tests__/.compilado/guia-catalogo/enlace-del-catalogo.mjs --log-level=warning

node --test lib/__tests__/guia-catalogo.test.mjs
node --test lib/__tests__/video-guia-catalogo.test.mjs
GUIA=catalogo node --test lib/__tests__/miniaturas-guia-leads.test.mjs
node --test lib/__tests__/fin-de-la-guia.test.mjs
node --test lib/__tests__/menu-de-la-guia.test.mjs

if [ ! -d .next/static/css ]; then
  echo "(sin build: se salta la mitad del navegador)"; exit 0
fi
APP="${APP:-3941}"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       DATABASE_URL="postgresql://nadie@localhost:1/nada" DIRECT_URL="postgresql://nadie@localhost:1/nada" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco NEXT_TELEMETRY_DISABLED=1
# Sin base a propósito: la guía no lee nada de ella, así que tiene que
# servirse igual con la base caída. El catálogo público SÍ lee la base: aquí
# solo se comprueba que el middleware no lo manda al login.
setsid npx next start -p "$APP" >/tmp/guia-catalogo-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/catalogo" && break; sleep 1; done
GUIA=catalogo COMPROBAR_PUBLICAS="/catalogo/cuenta-de-ejemplo,/c/cafe-del-monte" BASE="http://localhost:$APP" node scripts/probar-guia.mjs
