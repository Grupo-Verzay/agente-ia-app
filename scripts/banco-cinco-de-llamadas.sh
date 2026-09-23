#!/usr/bin/env bash
# El banco de «los cinco asuntos de CRM › Llamadas».
#
# Dos mitades, porque el cambio vive en dos capas:
#
#   1. LA DECISIÓN, pura y sin navegador (`cinco-de-llamadas.test.mjs`):
#      qué dice Detalle con y sin resumen, los cinco resultados, qué propone
#      la IA, quién manda cuando una persona lo cambia y qué total enseña el
#      reproductor antes de pulsar play.
#   2. LA PANTALLA, en Chromium y sobre el CSS del build
#      (`cinco-de-llamadas-en-pantalla.test.mjs`): la columna Detalle, la
#      pastilla del resultado propuesto por IA y su corrección a mano, y el
#      diálogo con resumen y transcripción presentes y ausentes y la duración
#      visible desde que abre.
#
# La otra mitad de lo que hay que probar —que la IA propone contra Postgres y
# que la persona manda sobre ella— vive en `scripts/banco-grabacion-de-llamada.sh`
# (sección H), que ya levanta la base y el doble de OpenAI.
#
# Y el tramo de timbre (asunto 4) se prueba en el repositorio de AstraCalls:
# `go test ./cmd/server -run GrabacionAlContestar`.
#
# `MODO=roto` monta lo que había en ANTES_REF —la tabla, el diálogo, la
# columna Detalle y los siete resultados— y **afirma los fallos**. Pinchado a
# un commit, nunca a `origin/main`: en cuanto esto se fusione, main pasa a
# ser el «ahora» y el modo roto se pondría verde sin ejercer nada.
#
# Uso:  scripts/banco-cinco-de-llamadas.sh
#       MODO=roto scripts/banco-cinco-de-llamadas.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
# El estado de CRM › Llamadas justo ANTES de este cambio.
ANTES_REF="${ANTES_REF:-4b7d47e0881c33f2e33d6dc022d5b770b522e4f3}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY_PURO=".banco-cinco-puro-entry.ts"
ENTRY=".banco-cinco-entry.tsx"
ANTES_CRM="app/(root)/crm/llamadas/_banco_cinco_antes"
trap 'rm -rf "$ENTRY" "$ENTRY_PURO" "$ANTES_CRM"' EXIT

if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_CRM"
  for f in CallsCrmClient.tsx DialogoDeLlamar.tsx CallDetailDialog.tsx rango-de-dias.ts; do
    git show "$ANTES_REF":"app/(root)/crm/llamadas/_components/$f" > "$ANTES_CRM/$f" || {
      echo "no se pudo leer $f de $ANTES_REF; corre 'git fetch origin'" >&2
      exit 1
    }
  done
  # La columna Detalle y la lista de resultados de ANTES van con la tabla de
  # antes: con las de hoy, el modo roto pintaría el arreglo y no el fallo.
  git show "$ANTES_REF":lib/detalle-de-la-llamada.ts > "$ANTES_CRM/detalle-de-la-llamada.ts"
  git show "$ANTES_REF":lib/call-dispositions.ts > "$ANTES_CRM/call-dispositions.ts"
  sed -i "s#'@/lib/detalle-de-la-llamada'#'./detalle-de-la-llamada'#; s#'@/lib/call-dispositions'#'./call-dispositions'#" \
    "$ANTES_CRM/CallsCrmClient.tsx"
  cat > "$ENTRY_PURO" <<TS
export { elDetalleDeLaLlamada } from "@/$ANTES_CRM/detalle-de-la-llamada";
export { CALL_DISPOSITIONS, getDispositionMeta } from "@/$ANTES_CRM/call-dispositions";
TS
  DESDE="@/$ANTES_CRM/CallsCrmClient"
else
  echo 'export * from "./lib/__tests__/fingido/entrada-cinco-de-llamadas";' > "$ENTRY_PURO"
  DESDE="@/app/(root)/crm/llamadas/_components/CallsCrmClient"
fi

npx esbuild "$ENTRY_PURO" --bundle --platform=node --format=esm \
  --outfile=lib/__tests__/.compilado/cinco-de-llamadas-puro.mjs \
  --alias:@="$(pwd)" --log-level=error

cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { CallsCrmClient } from "$DESDE";

(window as any).pintarTabla = () => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("pantalla")!));
    raiz.render(React.createElement(CallsCrmClient as any, { embedded: true, cuentas: [], cuentaPropia: "u1" }));
};
(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm \
  --outfile=lib/__tests__/.compilado/harness-cinco-de-llamadas.js \
  --alias:@="$(pwd)" \
  --alias:@/actions/calls-crm-actions=./lib/__tests__/fingido/llamadas-del-crm.ts \
  --alias:@/actions/missed-call-reply-actions=./lib/__tests__/fingido/acciones-de-llamadas-mudas.ts \
  --alias:@/actions/voicebot-actions=./lib/__tests__/fingido/acciones-de-llamadas-mudas.ts \
  --alias:@/actions/crm-follow-up-actions=./lib/__tests__/fingido/acciones-de-llamadas-mudas.ts \
  --alias:@/components/chats/AnfitrionDeLlamada=./lib/__tests__/fingido/anfitrion-mudo.ts \
  --alias:@/actions/cuentas-para-llamar-actions=./lib/__tests__/fingido/cuentas-para-llamar-de-mentira.ts \
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-mudo.ts \
  --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

echo "── los cinco asuntos de CRM › Llamadas (MODO=$MODO) ──"
node --test lib/__tests__/cinco-de-llamadas.test.mjs lib/__tests__/cinco-de-llamadas-en-pantalla.test.mjs "$@"
