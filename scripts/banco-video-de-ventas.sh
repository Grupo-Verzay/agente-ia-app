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
#      y el vídeo publicado es un MP4 de menos de dos minutos sin huecos mudos.
#   2. `scripts/probar-demo.mjs`: la página SERVIDA sin sesión, en Chromium a
#      390 y 1440 (hace falta el build).
#
# `MODO=roto` saca la `areListsDifferent` de ANTES_REF —pinchado a un commit,
# nunca `origin/main`— y afirma el fallo: el borrador se quedaba para siempre,
# y no había ni vídeo, ni página, ni refresco de la ficha.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO ANTES_REF="${ANTES_REF:-316b70c}"
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
  exit 0
fi

sacar_la_lista "app/(root)/chats/_components/chats-client.tsx" "$OUT/lista-ahora.ts"
compilar "$OUT/lista-ahora.ts" "$OUT/lista-ahora.mjs"
for M in aviso-en-vivo-del-chat crm-de-la-conversacion-abierta bandeja video-de-ventas; do
  compilar "lib/$M.ts" "$OUT/$M.mjs"
done
node --test lib/__tests__/video-de-ventas.test.mjs

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
