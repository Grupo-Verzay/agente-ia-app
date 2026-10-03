#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Chats (`/guia/chats`). Mismo estándar
# y mismas piezas que las demás guías:
#
#   1. `lib/__tests__/guia-chats.test.mjs`: la guía documenta EXACTAMENTE
#      las pastillas, los menús, los botones de la cabecera y de la barra de
#      escribir y los mandos de la llamada (buscados en el código), cada
#      captura existe, es pública y no indexable, y sus páginas son las de
#      Leads con otro nombre.
#   2. `lib/__tests__/video-guia-chats.test.mjs`: la narración Cedar, el
#      guion (no envía nada, se vuelve a sembrar antes) y el vídeo
#      publicado medido.
#   3. `miniaturas-guia-leads.test.mjs` con `GUIA=chats`.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=chats`: la guía servida sin sesión.
#
# Regenerar: npm run build && scripts/generar-guia-chats.sh && npm run build
#
# `MODO=roto` lee ANTES_CHATS_REF —pinchado— y afirma que no había guía.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_CHATS_REF="${ANTES_CHATS_REF:-de0cd9d}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-chats.test.mjs lib/__tests__/video-guia-chats.test.mjs
  GUIA=chats ANTES_REF="$ANTES_CHATS_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads informes catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda recordatorios campanas etiquetas conexion chats tareas correo follow-ups multiagenda embudos calificacion reportes proyectos; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done

node --test lib/__tests__/guia-chats.test.mjs
node --test lib/__tests__/video-guia-chats.test.mjs
GUIA=chats node --test lib/__tests__/miniaturas-guia-leads.test.mjs
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
setsid npx next start -p "$APP" >/tmp/guia-chats-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/chats" && break; sleep 1; done
GUIA=chats BASE="http://localhost:$APP" node scripts/probar-guia.mjs
