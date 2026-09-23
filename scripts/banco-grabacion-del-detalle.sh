#!/usr/bin/env bash
# El rótulo «Grabación» y el largo del reproductor en «Detalle de la llamada»
# (CRM › Llamadas): el rótulo lleva la onda de sonido con la misma caja que
# los de Resumen IA y Transcripción, y la nota de voz —la de Chats, con su
# duración al abrir— ocupa todo el ancho de su recuadro.
#
# En Chromium, sobre el CSS del build y con el diálogo real.
#
# `MODO=roto` monta el diálogo de ANTES_REF y **afirma los fallos**: el rótulo
# sin icono y la nota a 350 px. Pinchado a un commit, nunca a `origin/main`.
#
# Uso:  scripts/banco-grabacion-del-detalle.sh
#       MODO=roto scripts/banco-grabacion-del-detalle.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
# El diálogo justo ANTES de este cambio (#923).
ANTES_REF="${ANTES_REF:-30c8588}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY=".banco-grabacion-entry.tsx"
ANTES="lib/__tests__/.antes-grabacion"
trap 'rm -rf "$ENTRY" "$ANTES"' EXIT

F="app/(root)/crm/llamadas/_components/CallDetailDialog.tsx"
if [ "$MODO" = "roto" ]; then
  rm -rf "$ANTES"
  mkdir -p "$ANTES/$(dirname "$F")"
  git show "$ANTES_REF":"$F" > "$ANTES/$F" || {
    echo "no se pudo leer $F de $ANTES_REF; corre 'git fetch origin'" >&2
    exit 1
  }
  DESDE="@/$ANTES/app/(root)/crm/llamadas/_components/CallDetailDialog"
else
  DESDE="@/app/(root)/crm/llamadas/_components/CallDetailDialog"
fi

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
  --outfile=lib/__tests__/.compilado/harness-grabacion-del-detalle.js \
  --alias:@="$(pwd)" \
  --alias:@/actions/calls-crm-actions=./lib/__tests__/fingido/detalle-de-llamada.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

echo "── la grabación del detalle (MODO=$MODO) ──"
node --test lib/__tests__/grabacion-del-detalle.test.mjs "$@"
