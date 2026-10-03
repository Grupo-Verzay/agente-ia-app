#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Crear flujos (`/guia/flujos`). Mismo estándar
# que las demás guías, y las mismas piezas:
#
#   1. `lib/__tests__/guia-flujos.test.mjs`: la guía documenta EXACTAMENTE los
#      cuatro tipos y lo que filtra cada pastilla (`lib/flujos-de-la-lista.ts`),
#      el «⋯» de una tarjeta (`WorkflowAction.tsx`), la paleta «Selecciona una
#      acción» grupo por grupo (`types/workflow-node.ts`) y los topes de pasos,
#      seguimientos y caracteres; cada captura existe; la tarjeta de
#      «Tutoriales del módulo» está registrada; es pública y no indexable, y
#      sus dos páginas son las de Leads con otro nombre, letra por letra.
#   2. `lib/__tests__/video-guia-flujos.test.mjs`: la narración (Cedar, a ritmo
#      de conversación), el guion y el vídeo publicado medido con ffmpeg.
#   3. `miniaturas-guia-leads.test.mjs` con `GUIA=flujos`: cada tarjeta de
#      Secciones con su enfoque, medido en los píxeles.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=flujos`: la guía SERVIDA, sin sesión y sin
#      base, en Chromium a 390 y 1440 (hace falta el build).
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-flujos.sh && npm run build
#
# `MODO=roto` lee ANTES_FLUJOS_REF —pinchado a un commit, nunca `origin/main`—
# y afirma que no había guía, ni vídeo, ni miniaturas, que las pastillas de
# tipo no filtraban y que la pantalla no exponía con qué señalarla.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_FLUJOS_REF="${ANTES_FLUJOS_REF:-7767f6f}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-flujos.test.mjs lib/__tests__/video-guia-flujos.test.mjs
  GUIA=flujos ANTES_REF="$ANTES_FLUJOS_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads informes catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda recordatorios campanas etiquetas conexion chats tareas correo follow-ups multiagenda embudos calificacion; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done
O=lib/__tests__/.compilado/guia-flujos
npx esbuild lib/flujos-de-la-lista.ts --bundle --platform=node --format=esm --outfile="$O/flujos-de-la-lista.mjs" --log-level=warning
npx esbuild types/workflow-node.ts --bundle --platform=node --format=esm --outfile="$O/workflow-node.mjs" --log-level=warning --external:@prisma/client
npx esbuild types/workflow.ts --bundle --platform=node --format=esm --outfile="$O/workflow.mjs" --log-level=warning --external:@prisma/client

node --test lib/__tests__/guia-flujos.test.mjs
node --test lib/__tests__/video-guia-flujos.test.mjs
GUIA=flujos node --test lib/__tests__/miniaturas-guia-leads.test.mjs
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
setsid npx next start -p "$APP" >/tmp/guia-flujos-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/flujos" && break; sleep 1; done
GUIA=flujos BASE="http://localhost:$APP" node scripts/probar-guia.mjs
