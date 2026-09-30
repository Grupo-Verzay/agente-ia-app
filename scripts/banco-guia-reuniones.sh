#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de Reuniones (`/guia/reuniones`), con el mismo
# estándar que el de Leads (`banco-guia-leads.sh`):
#
#   1. `lib/__tests__/guia-reuniones.test.mjs`: la guía documenta EXACTAMENTE
#      las pestañas, las acciones de una fila, las caducidades, los seis
#      mandos de abajo, los botones de la cabecera de la reunión y las
#      opciones de grabar y del fondo que pinta la pantalla (leídos del
#      código), y los números que promete; cada captura existe; es pública,
#      no indexable y simétrica con la de Leads.
#   2. `lib/__tests__/video-guia-reuniones.test.mjs`: el vídeo dice todas las
#      frases con Cedar a ritmo de conversación, sin huecos, con la imagen
#      pegada a la voz y en un minuto.
#   3. `lib/__tests__/miniaturas-guia-reuniones.test.mjs`: cada tarjeta con
#      su enfoque, medido en los píxeles con la MISMA vara que las de Leads.
#   4. `lib/__tests__/fin-de-la-guia.test.mjs`: todo índice de guía —las dos—
#      acaba en la línea divisoria.
#   5. `probar-guia-leads.mjs` con `GUIA=reuniones`: la guía SERVIDA, sin
#      sesión, en Chromium a 390 y 1440 (hace falta el build).
#
# `MODO=roto` lee los ficheros de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y afirma que no había guía de Reuniones, ni vídeo, ni
# miniaturas, y que la espera en la puerta salía casi negro sobre casi negro.
#
# Las capturas y el vídeo se generan desde la App real:
#   npm run build && scripts/generar-guia-reuniones.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_REF="${ANTES_REF:-24ba0b2}"

TESTS=(lib/__tests__/guia-reuniones.test.mjs lib/__tests__/video-guia-reuniones.test.mjs lib/__tests__/miniaturas-guia-reuniones.test.mjs)

if [ "$MODO" = "roto" ]; then
  node --test "${TESTS[@]}"
  exit $?
fi

OUT=lib/__tests__/.compilado/guia-reuniones
mkdir -p "$OUT"
npx esbuild lib/guia-reuniones.ts --bundle --platform=node --format=esm --outfile="$OUT/guia-reuniones.mjs" --log-level=warning
npx esbuild lib/sala-de-video.ts --bundle --platform=node --format=esm --outfile="$OUT/sala-de-video.mjs" --log-level=warning
npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
# Los números que promete la guía, sacados de sus módulos puros.
printf 'export { DIAS_DE_HISTORICO } from "../../../reuniones-de-la-cuenta";\nexport { DIAS_DE_GRABACION } from "../../../grabacion-de-reunion";\n' > "$OUT/cifras.ts"
npx esbuild "$OUT/cifras.ts" --bundle --platform=node --format=esm --outfile="$OUT/cifras.mjs" --log-level=warning
for t in "${TESTS[@]}" lib/__tests__/fin-de-la-guia.test.mjs; do node --test "$t"; done

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
setsid npx next start -p "$APP" >/tmp/guia-reuniones-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/reuniones" && break; sleep 1; done
GUIA=reuniones BASE="http://localhost:$APP" node scripts/probar-guia-leads.mjs
