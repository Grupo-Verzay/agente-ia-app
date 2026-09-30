#!/usr/bin/env bash
# El banco del VÍDEO DE VENTAS (`/demo`) y de lo que hubo que arreglar en la
# App para grabarlo de verdad:
#
#   1. `lib/__tests__/video-de-ventas.test.mjs`: el borrador de un aviso en
#      vivo se sustituye (la regla y la `areListsDifferent` de verdad de
#      `chats-client`, sacada del fichero), el CRM de la conversación abierta
#      se pone al día, la historia y el estudio pintan cada mensaje como la
#      App, ninguna voz se pisa, la voz Cedar está entera, el guion dice cada
#      frase y cada mensaje una vez, la página promete lo que el vídeo enseña,
#      las escenas nuevas (la apertura, Google Sheets, la llamada, el asesor,
#      los reportes, el resumen y las tres avanzadas) están en su orden, el
#      botón de WhatsApp del cierre lleva el +57 323 361 2620, las pantallas
#      escondidas del portátil van con `visibility: hidden` (con cuatro capas y
#      solo transparentes no se pintaba ninguna), y el vídeo publicado es un MP4
#      de entre dos minutos y medio y tres, sin huecos mudos.
#   2. `lib/__tests__/montaje-del-video.test.mjs`: los primeros segundos
#      PINTADOS en Chromium con el estudio de verdad —cinco negocios en su
#      orden, el encabezado de WhatsApp compacto y sin franja de color, los
#      mensajes pegados arriba, un contenido distinto por tarjeta (el PDF y el
#      mapa los manda la IA), la portada del video con su imagen, su botón y su
#      duración legible, medida en los píxeles; el cierre «y cualquier
#      negocio…» en una línea debajo de las cinco, y la marca sin píldoras—.
#   3. `scripts/probar-demo.mjs`: la página SERVIDA sin sesión, en Chromium a
#      390 y 1440 (hace falta el build).
#
# `MODO=roto` saca la `areListsDifferent` de ANTES_REF —pinchado a un commit,
# nunca `origin/main`— y afirma el fallo: el borrador se quedaba para siempre,
# y no había ni vídeo, ni página, ni refresco de la ficha. Y pinta el estudio
# de ANTES_MONTAJE (también pinchado) y afirma el arranque viejo: cinco
# tarjetas con franja de color, los mensajes abajo, sin cierre y con píldoras;
# el de ANTES_DEL_CIERRE: cuatro tarjetas, el PDF mandado por el cliente, el
# cierre como una columna al lado y la duración del video ilegible; y las
# tarjetas de hoy con el marco del celular de ANTES_MONTAJE, cuyas clases
# chocaban con las de una burbuja de video: la portada sale negra. Y lee la
# historia de ANTES_DE_LAS_ESCENAS (pinchado) para afirmar que allí la apertura
# decía otra cosa y no había ni Sheets, ni llamada, ni asesor, ni reportes, ni
# resumen, ni el botón de WhatsApp en el cierre; y que sus capas escondidas
# solo eran transparentes.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_REF="${ANTES_REF:-316b70c}" ANTES_MONTAJE="${ANTES_MONTAJE:-1807a22}" ANTES_DEL_CIERRE="${ANTES_DEL_CIERRE:-a7e2b45}" \
       ANTES_DE_LAS_ESCENAS="${ANTES_DE_LAS_ESCENAS:-e2e0005}"
OUT="lib/__tests__/.compilado/video-de-ventas"
mkdir -p "$OUT"

# La `areListsDifferent` de chats-client, sacada del fichero tal cual —de hoy o
# de ANTES_REF— con lo que usa alrededor. Así se ejerce la función que corre en
# la pantalla, no una copia escrita en el banco.
sacar_la_lista() {
  local fuente="$1" salida="$2"
  node - "$fuente" "$salida" <<'JS'
const fs = require("node:fs");
const [, , fuente, salida] = process.argv;
const src = fs.readFileSync(fuente, "utf8");
const desde = src.indexOf("function getLastIdTimestamp(");
const funcion = src.indexOf("function areListsDifferent(");
const hasta = src.indexOf("\n}\n", funcion);
if (desde < 0 || funcion < 0 || hasta < 0) {
  console.error("[banco] no encuentro getLastIdTimestamp/areListsDifferent en " + fuente);
  process.exit(1);
}
const cabecera = [
  'import { epochToMs } from "@/lib/epoch";',
  'import { idDeWhatsapp } from "@/lib/id-de-whatsapp";',
  'import { traeLoQueFaltabaDeUnAviso } from "@/lib/aviso-en-vivo-del-chat";',
  "type EvolutionMessage = any;",
].join("\n");
fs.writeFileSync(salida, `${cabecera}\n${src.slice(desde, hasta + 2)}\nexport { areListsDifferent };\n`);
JS
}
compilar() { npx esbuild "$1" --bundle --platform=node --format=esm --outfile="$2" --log-level=warning; }

if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:app/(root)/chats/_components/chats-client.tsx" > "$OUT/chats-client-antes.tsx"
  sacar_la_lista "$OUT/chats-client-antes.tsx" "$OUT/lista-antes.ts"
  compilar "$OUT/lista-antes.ts" "$OUT/lista-antes.mjs"
  node --test lib/__tests__/video-de-ventas.test.mjs
  node --test lib/__tests__/montaje-del-video.test.mjs
  exit 0
fi

sacar_la_lista "app/(root)/chats/_components/chats-client.tsx" "$OUT/lista-ahora.ts"
compilar "$OUT/lista-ahora.ts" "$OUT/lista-ahora.mjs"
for M in aviso-en-vivo-del-chat crm-de-la-conversacion-abierta bandeja video-de-ventas; do
  compilar "lib/$M.ts" "$OUT/$M.mjs"
done
node --test lib/__tests__/video-de-ventas.test.mjs
node --test lib/__tests__/montaje-del-video.test.mjs

if [ ! -d .next/static/css ]; then
  echo "(sin build: se salta la mitad del navegador)"; exit 0
fi
APP="${APP:-3942}"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       DATABASE_URL="postgresql://nadie@localhost:1/nada" DIRECT_URL="postgresql://nadie@localhost:1/nada" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco NEXT_TELEMETRY_DISABLED=1
# Sin base a propósito: la página no lee nada de ella, así que tiene que
# servirse igual con la base caída.
setsid npx next start -p "$APP" >/tmp/video-de-ventas-banco-next.log 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP/demo" && break; sleep 1; done
BASE="http://localhost:$APP" node scripts/probar-demo.mjs
