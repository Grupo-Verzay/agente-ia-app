#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Correos (`/guia/correo`). Mismo estándar
# y mismas piezas que las demás guías:
#
#   1. `lib/__tests__/guia-correo.test.mjs`: la guía documenta EXACTAMENTE
#      las pastillas, la flecha, «Buscar en», las formas de conectar, el
#      dominio propio, la selección, los tres «⋯», los mandos del correo y la
#      barra de responder (leídos del código), cada captura existe, es pública
#      y no indexable, no lleva datos reales y sus páginas son las de Leads.
#   2. `lib/__tests__/video-guia-correo.test.mjs`: la narración Cedar, el
#      guion (no envía, no borra, no desconecta, no sigue un OAuth) y el vídeo
#      publicado medido.
#   3. `miniaturas-guia-leads.test.mjs` con `GUIA=correo`.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=correo`: la guía servida sin sesión.
#
# Regenerar: npm run build && scripts/generar-guia-correo.sh && npm run build
#
# `MODO=roto` lee ANTES_CORREO_REF —pinchado— y afirma que no había guía.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_CORREO_REF="${ANTES_CORREO_REF:-400482e}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-correo.test.mjs lib/__tests__/video-guia-correo.test.mjs
  GUIA=correo ANTES_REF="$ANTES_CORREO_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda recordatorios campanas etiquetas conexion chats tareas correo follow-ups multiagenda embudos calificacion cobros; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done
npx esbuild lib/correo.ts --bundle --platform=node --format=esm --outfile=lib/__tests__/.compilado/guia-correo/correo.mjs --log-level=warning

node --test lib/__tests__/guia-correo.test.mjs
node --test lib/__tests__/video-guia-correo.test.mjs
GUIA=correo node --test lib/__tests__/miniaturas-guia-leads.test.mjs
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
setsid npx next start -p "$APP" >/tmp/guia-correo-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/correo" && break; sleep 1; done
GUIA=correo BASE="http://localhost:$APP" node scripts/probar-guia.mjs
