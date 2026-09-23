#!/usr/bin/env bash
# CRM › Llamadas: la cuenta de cada llamada ya no es una columna, es «● Ventas»
# pegado a la derecha del nombre, con la MISMA marca y el mismo color que la
# lista de Chats.
#
# Tres mitades:
#   1. La decisión, pura y sin navegador (`lib/insignia-de-linea.ts`): el color
#      y la palabra corta son los que Chats pintaba, hash incluido.
#   2. Un barrido del código: Chats y Llamadas pintan con `InsigniaDeLinea` y
#      ninguno lleva ya su propia copia de la paleta.
#   3. La tabla PINTADA en Chromium, consolidando, con el `CallsCrmClient` de
#      verdad: siete columnas sin «Cuenta», el puntico dentro de la celda del
#      nombre y a su derecha, y su color el de Chats para esa línea.
#
# `MODO=roto` monta la tabla y la fila de Chats de un commit PINCHADO (`ANTES_REF`,
# nunca `origin/main`: en cuanto esto se fusione sería el «ahora») y AFIRMA el
# fallo: la primera columna es «Cuenta» y no hay puntico junto al nombre.
#
# Uso:  scripts/banco-cuenta-en-llamadas.sh
#       MODO=roto scripts/banco-cuenta-en-llamadas.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
# El estado de la pantalla ANTES de este cambio.
ANTES_REF="${ANTES_REF:-8bdb33f}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY=".banco-cuenta-en-llamadas-entry.tsx"
ANTES_CRM="app/(root)/crm/llamadas/_banco_cuenta_antes"
ANTES_CHAT="app/(root)/chats/_banco_cuenta_antes"
trap 'rm -rf "$ENTRY" "$ANTES_CRM" "$ANTES_CHAT"' EXIT

if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_CRM"
  for f in CallsCrmClient.tsx DialogoDeLlamar.tsx CallDetailDialog.tsx rango-de-dias.ts; do
    git show "$ANTES_REF":"app/(root)/crm/llamadas/_components/$f" > "$ANTES_CRM/$f" || {
      echo "no se pudo leer $f de $ANTES_REF" >&2; exit 1; }
  done
  mkdir -p "$ANTES_CHAT"
  git show "$ANTES_REF":"app/(root)/chats/_components/ChatContactItem.tsx" > "$ANTES_CHAT/ChatContactItem.tsx"
  DESDE_TABLA="@/app/(root)/crm/llamadas/_banco_cuenta_antes/CallsCrmClient"
  DESDE_CHAT="./app/(root)/chats/_banco_cuenta_antes/ChatContactItem.tsx"
else
  DESDE_TABLA="@/app/(root)/crm/llamadas/_components/CallsCrmClient"
  DESDE_CHAT="./app/(root)/chats/_components/ChatContactItem.tsx"
fi
export DESDE_CHAT

cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { CallsCrmClient } from "$DESDE_TABLA";

(window as any).pintarTabla = () => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("pantalla")!));
    raiz.render(
        React.createElement(CallsCrmClient as any, {
            embedded: true,
            cuentas: ["u1", "u2"],
            cuentaPropia: "u1",
            unificado: true,
            nombresDeCuenta: { u1: "Verzay | Atención", u2: "Verzay | Ventas" },
        }),
    );
};
(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm \
  --outfile=lib/__tests__/.compilado/harness-cuenta-en-llamadas.js \
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

npx esbuild lib/insignia-de-linea.ts --format=esm \
  --outfile=lib/__tests__/.compilado/insignia-de-linea.mjs --log-level=error

echo "── La cuenta en CRM › Llamadas (MODO=$MODO) ──"
node --test lib/__tests__/cuenta-en-llamadas.test.mjs "$@"
