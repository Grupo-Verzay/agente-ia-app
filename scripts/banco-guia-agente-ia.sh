#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Agente IA (`/guia/agente-ia`) y de lo que se
# arregló en la pantalla `/ia` al documentarla. Mismo estándar que la de Leads,
# Catálogo, Diagramas, Reuniones, Mis notas, Google Sheets e Integrar URLs, y
# las mismas piezas:
#
#   1. `lib/__tests__/pestanas-del-agente.test.mjs`: la PANTALLA —las ocho
#      pestañas salen de `ai-section-labels.ts`, las cinco listas tienen los
#      mismos bordes, toda tarjeta de elemento lleva `TituloDelElemento`, el
#      contador cuenta elementos, Guardar no se enciende al abrir, las dos
#      hojas del «⋯» miden lo mismo y la «X» de Métricas no tapa nada—.
#   2. `lib/__tests__/guia-agente-ia.test.mjs`: la guía documenta EXACTAMENTE
#      los canales, las pestañas, «Agregar acción», los modos de bienvenida,
#      los tipos de captura, las reglas de palabras clave, el «⋯» y los campos
#      del Perfil (leídos del código), cada captura existe, es pública y no
#      indexable, y sus dos páginas son las de Leads con otro nombre.
#   3. `lib/__tests__/video-guia-agente-ia.test.mjs`: la narración (Cedar, a
#      ritmo de conversación, la frase de la barra de arriba igual que en
#      Leads), el guion (cada acción en su palabra, la grabadora propia, nada
#      que borre) y el vídeo publicado medido: sin huecos, acaba con la voz y
#      la imagen va con la voz.
#   4. `miniaturas-guia-leads.test.mjs` con `GUIA=agente-ia`: cada tarjeta de
#      Secciones con su enfoque, medido en los píxeles.
#   5. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   6. `probar-guia.mjs` con `GUIA=agente-ia`: la guía SERVIDA, sin sesión y
#      sin base, en Chromium a 390 y 1440 (hace falta el build).
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-agente-ia.sh && npm run build
#
# `MODO=roto` lee commits PINCHADOS —nunca `origin/main`—: ANTES_AGENTE_IA_REF
# para afirmar que no había guía, ni vídeo, ni miniaturas, ni marcas en la
# pantalla; ANTES_PANTALLA_REF para afirmar los fallos de la pantalla.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_AGENTE_IA_REF="${ANTES_AGENTE_IA_REF:-24ba0b2}" ANTES_PANTALLA_REF="${ANTES_PANTALLA_REF:-ab6b110}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/pestanas-del-agente.test.mjs lib/__tests__/guia-agente-ia.test.mjs lib/__tests__/video-guia-agente-ia.test.mjs
  GUIA=agente-ia ANTES_REF="$ANTES_AGENTE_IA_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done
# El orden de los elementos de un paso, que el banco de la pantalla ejerce de
# verdad (Guardar no se enciende al abrir).
mkdir -p lib/__tests__/.compilado/agente-ia
npx esbuild lib/orden-de-elementos.ts --bundle --platform=node --format=esm \
  --outfile=lib/__tests__/.compilado/agente-ia/orden-de-elementos.mjs --log-level=warning

node --test lib/__tests__/pestanas-del-agente.test.mjs
node --test lib/__tests__/guia-agente-ia.test.mjs
node --test lib/__tests__/video-guia-agente-ia.test.mjs
GUIA=agente-ia node --test lib/__tests__/miniaturas-guia-leads.test.mjs
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
setsid npx next start -p "$APP" >/tmp/guia-agente-ia-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/agente-ia" && break; sleep 1; done
GUIA=agente-ia BASE="http://localhost:$APP" node scripts/probar-guia.mjs
