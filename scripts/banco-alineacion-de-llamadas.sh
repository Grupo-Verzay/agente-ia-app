#!/usr/bin/env bash
# CRM › Llamadas alineada como Leads: encabezados CENTRADOS con su mismo estilo,
# «WhatsApp» en vez de «Contacto», el contenido a la izquierda salvo Duración
# y el menú de Acciones (centrados), y el nombre, la fecha y el detalle en
# negrilla y en el color del texto.
#
# Se mide la tabla PINTADA en Chromium, sobre el CSS del build y con el
# `CallsCrmClient` de verdad (solo se fingen sus acciones de servidor).
#
# `MODO=roto` monta la tabla de un commit PINCHADO (`ANTES_REF`, nunca
# `origin/main`: en cuanto esto se fusione sería el «ahora») y AFIRMA el fallo:
# rótulos a la izquierda, «Contacto», Duración y Acciones a la izquierda, y el
# nombre, la fecha y el detalle en gris y sin negrilla.
#
# Uso:  scripts/banco-alineacion-de-llamadas.sh
#       MODO=roto scripts/banco-alineacion-de-llamadas.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
# El estado de la tabla ANTES de este cambio.
ANTES_REF="${ANTES_REF:-2b38731}"
export MODO ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY=".banco-alineacion-de-llamadas-entry.tsx"
ANTES="app/(root)/crm/llamadas/_banco_alineacion_antes"
trap 'rm -rf "$ENTRY" "$ANTES"' EXIT

if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES"
  for f in $(git ls-tree --name-only "$ANTES_REF" "app/(root)/crm/llamadas/_components/" | xargs -n1 basename); do
    git show "$ANTES_REF":"app/(root)/crm/llamadas/_components/$f" > "$ANTES/$f" || {
      echo "no se pudo leer $f de $ANTES_REF" >&2; exit 1; }
  done
  DESDE="@/app/(root)/crm/llamadas/_banco_alineacion_antes/CallsCrmClient"
else
  DESDE="@/app/(root)/crm/llamadas/_components/CallsCrmClient"
fi

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
  --outfile=lib/__tests__/.compilado/harness-alineacion-de-llamadas.js \
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

echo "── Alineación de CRM › Llamadas (MODO=$MODO) ──"
node --test --test-reporter=spec lib/__tests__/alineacion-de-llamadas.test.mjs "$@"
