#!/usr/bin/env bash
# El banco del diálogo «Detalle de la llamada» de CRM › Llamadas: la
# grabación como nota de voz (la de Chats), el nombre de la marca al guardar,
# los iconos por hablante solo cuando el texto trae los turnos, y sin «Cerrar».
#
# Dos mitades en un solo fichero (`lib/__tests__/detalle-de-llamada.test.mjs`):
# la decisión pura y un barrido del código, sin navegador; y el diálogo
# PINTADO en Chromium sobre el CSS del build, con un WAV de verdad de 187 s.
#
# `MODO=roto` monta el diálogo y `lib/nombres-de-la-marca.ts` de ANTES_REF y
# **afirma los fallos**. Pinchado a un commit, nunca a `origin/main`: en cuanto
# esto se fusione, main pasa a ser el «ahora» y el modo roto se pondría verde
# sin ejercer nada.
#
# Uso:  scripts/banco-detalle-de-llamada.sh
#       MODO=roto scripts/banco-detalle-de-llamada.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
# El diálogo justo ANTES de este cambio (#920).
ANTES_REF="${ANTES_REF:-20db904}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY=".banco-detalle-entry.tsx"
ENTRY_PURO=".banco-detalle-puro-entry.ts"
ANTES="lib/__tests__/.antes-detalle"
trap 'rm -rf "$ENTRY" "$ENTRY_PURO" "$ANTES"' EXIT

if [ "$MODO" = "roto" ]; then
  rm -rf "$ANTES"
  for f in "app/(root)/crm/llamadas/_components/CallDetailDialog.tsx" \
           "app/(root)/chats/_components/MediaRenderer.tsx" \
           "lib/nombres-de-la-marca.ts" "lib/reproductor-de-llamada.ts"; do
    mkdir -p "$ANTES/$(dirname "$f")"
    git show "$ANTES_REF":"$f" > "$ANTES/$f" || {
      echo "no se pudo leer $f de $ANTES_REF; corre 'git fetch origin'" >&2
      exit 1
    }
  done
  export FUENTES_DEL_DETALLE="$(pwd)/$ANTES"
  echo "export { conElNombreDeLaMarca } from \"@/$ANTES/lib/nombres-de-la-marca\";" > "$ENTRY_PURO"
  DESDE="@/$ANTES/app/(root)/crm/llamadas/_components/CallDetailDialog"
else
  echo 'export * from "./lib/__tests__/fingido/entrada-detalle-de-llamada";' > "$ENTRY_PURO"
  DESDE="@/app/(root)/crm/llamadas/_components/CallDetailDialog"
fi

npx esbuild "$ENTRY_PURO" --bundle --platform=node --format=esm \
  --outfile=lib/__tests__/.compilado/detalle-de-llamada-puro.mjs \
  --alias:@="$(pwd)" --log-level=error

cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { CallDetailDialog } from "$DESDE";
import { LLAMADAS } from "@/lib/__tests__/fingido/detalle-de-llamada";

(window as any).abrir = (id: string) => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("pantalla")!));
    raiz.render(null);
    setTimeout(() => {
        raiz.render(
            React.createElement(CallDetailDialog as any, {
                key: id,
                call: LLAMADAS[id],
                recordingUrl: null,
                open: true,
                onOpenChange: () => {},
            }),
        );
    }, 0);
};
(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm \
  --outfile=lib/__tests__/.compilado/harness-detalle-de-llamada.js \
  --alias:@="$(pwd)" \
  --alias:@/actions/calls-crm-actions=./lib/__tests__/fingido/detalle-de-llamada.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

echo "── el detalle de la llamada (MODO=$MODO) ──"
node --test lib/__tests__/detalle-de-llamada.test.mjs "$@"
