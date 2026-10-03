#!/usr/bin/env bash
# El banco de la GUÍA PÚBLICA de AI Imágenes (`/guia/ai-imagenes`) y de lo que
# se arregló en la pantalla al documentarla. Mismo estándar que las guías de
# Leads, Catálogo, Diagramas, Reuniones y Mis notas, y las mismas piezas:
#
#   1. `lib/__tests__/guia-ai-imagenes.test.mjs`: la guía documenta EXACTAMENTE
#      los cuatro pasos, los tres formatos con su medida, las diez etapas, los
#      estilos de fábrica, los motores y las calidades (leídos del código) y lo
#      que cada red hace con los hashtags (`lib/copy-del-anuncio.ts`); el
#      Gemini fingido reconoce las etapas y las redes que la pantalla le pide;
#      cada captura existe, es pública y no indexable, y sus dos páginas son
#      las de Leads con otro nombre, letra por letra.
#   2. `lib/__tests__/pantalla-ai-imagenes.test.mjs`: los arreglos de la
#      pantalla —el paso «Campaña», la API key en «Configurar» y no en Mi
#      Perfil, cada imagen con su tipo, borrar un estilo con confirmación y que
#      vuelve si falla, el servidor que no guarda vacíos, sus tildes— y las
#      marcas con las que la receta señala cada parte.
#   3. `lib/__tests__/video-guia-ai-imagenes.test.mjs`: la narración (Cedar, a
#      ritmo de conversación, la barra de arriba igual que en Leads), el guion
#      (cada acción en su palabra, sin tocar datos de la cuenta) y el vídeo
#      publicado, medido como el de Diagramas.
#   4. `lib/__tests__/miniaturas-guia-leads.test.mjs` con `GUIA=ai-imagenes`:
#      cada tarjeta de Secciones con su enfoque, medido en los píxeles.
#   5. `fin-de-la-guia` y `menu-de-la-guia`, que barren TODAS las guías. (La
#      tarjeta de «Tutoriales del módulo» la prueba
#      `banco-tutoriales-del-modulo.sh`.)
#   6. `probar-guia.mjs` con `GUIA=ai-imagenes`: la guía SERVIDA, sin sesión y
#      sin base, en Chromium a 390 y 1440 (hace falta el build).
#
# Las capturas y el vídeo se generan desde la App real, con el Gemini fingido:
#   npm run build && scripts/generar-guia-ai-imagenes.sh && npm run build
#
# `MODO=roto` lee ANTES_AI_IMAGENES_REF —pinchado a un commit, nunca
# `origin/main`— y afirma que no había guía, ni vídeo, ni narración, ni
# miniaturas de AI Imágenes, y cada fallo de la pantalla.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_AI_IMAGENES_REF="${ANTES_AI_IMAGENES_REF:-ab6b110}"

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/guia-ai-imagenes.test.mjs lib/__tests__/pantalla-ai-imagenes.test.mjs lib/__tests__/video-guia-ai-imagenes.test.mjs
  GUIA=ai-imagenes ANTES_REF="$ANTES_AI_IMAGENES_REF" node --test lib/__tests__/miniaturas-guia-leads.test.mjs
  exit 0
fi

# Todas las guías se compilan: `menu-de-la-guia` las compara entre sí.
for G in leads catalogo diagramas reuniones notas mis-datos google-sheets integraciones agente-ia usuarios respuestas-rapidas macros formularios copiloto ai-imagenes finanzas llamadas productos flujos agenda recordatorios etiquetas conexion chats tareas correo follow-ups multiagenda reportes; do
  OUT="lib/__tests__/.compilado/guia-$G"
  mkdir -p "$OUT"
  npx esbuild "lib/guia-$G.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$G.mjs" --log-level=warning
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre-de-la-guia.mjs" --log-level=warning
done
OUT=lib/__tests__/.compilado/pantalla-ai-imagenes
mkdir -p "$OUT"
for F in copy-del-anuncio imagen-en-base64; do
  npx esbuild "lib/$F.ts" --bundle --platform=node --format=esm --outfile="$OUT/$F.mjs" --log-level=warning
done

node --test lib/__tests__/guia-ai-imagenes.test.mjs
node --test lib/__tests__/pantalla-ai-imagenes.test.mjs
node --test lib/__tests__/video-guia-ai-imagenes.test.mjs
GUIA=ai-imagenes node --test lib/__tests__/miniaturas-guia-leads.test.mjs
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
setsid npx next start -p "$APP" >/tmp/guia-ai-imagenes-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/guia/ai-imagenes" && break; sleep 1; done
GUIA=ai-imagenes BASE="http://localhost:$APP" node scripts/probar-guia.mjs
