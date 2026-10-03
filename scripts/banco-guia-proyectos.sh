#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Proyectos (`/guia/proyectos`). Mismo estándar
# que las demás guías, y las mismas piezas:
#
#   1. `lib/__tests__/guia-proyectos.test.mjs`: la guía documenta EXACTAMENTE
#      la barra, las cifras, las partes y los botones de una tarjeta, los
#      campos de «Nuevo proyecto», las columnas del tablero, el filtro de
#      vencimiento y las partes y campos de una tarea (leídos del código);
#      cada captura existe, es pública y sus dos páginas son las de Leads con
#      otro nombre.
#   2. `lib/__tests__/video-guia-proyectos.test.mjs`: la narración Cedar, el
#      guion (no confirma nada) y el vídeo medido.
#   3. `miniaturas-guia-leads.test.mjs` con `GUIA=proyectos`.
#   4. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías.
#   5. `probar-guia.mjs` con `GUIA=proyectos`: la guía SERVIDA, sin sesión.
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-proyectos.sh && npm run build
#
# `MODO=roto` lee ANTES_PROYECTOS_REF —pinchado, nunca `origin/main`— y afirma
# que no había guía ni marcas en la pantalla.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_PROYECTOS_REF="${ANTES_PROYECTOS_REF:-84f98e5}"

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in $(ls lib/guia-*.ts | sed -E "s#lib/guia-(.*)\.ts#\1#" | grep -v "^de-modulo$") reportes; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-proyectos.test.mjs lib/__tests__/video-guia-proyectos.test.mjs
  GUIA=proyectos ANTES_REF="$ANTES_PROYECTOS_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

node --test lib/__tests__/guia-proyectos.test.mjs
node --test lib/__tests__/video-guia-proyectos.test.mjs
GUIA=proyectos node --test lib/__tests__/miniaturas-guia-leads.test.mjs
node --test lib/__tests__/fin-de-la-guia.test.mjs
node --test lib/__tests__/menu-de-la-guia.test.mjs

if [ ! -d .next/static/css ]; then
  echo "(sin build: se salta la mitad del navegador)"; exit 0
fi
APP="${APP:-3948}"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       DATABASE_URL="postgresql://nadie@localhost:1/nada" DIRECT_URL="postgresql://nadie@localhost:1/nada" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco NEXT_TELEMETRY_DISABLED=1
setsid npx next start -p "$APP" >/tmp/guia-proyectos-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/proyectos" && break; sleep 1; done
GUIA=proyectos BASE="http://localhost:$APP" node scripts/probar-guia.mjs
