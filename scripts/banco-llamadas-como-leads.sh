#!/usr/bin/env bash
# El banco de «Llamadas se alinea con Leads»: la tabla, la ventana de Llamar y
# el menú de llamar de la cabecera de Chats.
#
# Todo se mide en Chromium y sobre el CSS del build, con los componentes de
# VERDAD —`CallsCrmClient` entero y `MenuDeLlamada`—: las cinco preguntas del
# encargo son de píxeles (qué columnas hay, si Acciones se corta, si el pie
# tiene los botones en una fila, dónde cae el menú) y no se contestan leyendo.
#
# `MODO=roto` monta el «antes», sacado con `git show` de un commit CONCRETO y
# puesto en una carpeta hermana con sus vecinos del mismo commit —así sus `./`
# resuelven al fichero de su época y no al de hoy—, y AFIRMA los fallos.
#
# El «antes» va PINCHADO, nunca a `origin/main`: en cuanto esto se fusione,
# `origin/main` pasa a ser el «ahora» y el modo roto se pondría verde sin
# ejercer nada. Ya le pasó a dos bancos de esta misma pantalla.
#
# Uso:  scripts/banco-llamadas-como-leads.sh
#       MODO=roto scripts/banco-llamadas-como-leads.sh   <- afirma los fallos
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
# El estado de las tres pantallas ANTES de este cambio.
ANTES_REF="${ANTES_REF:-bd7f6360d681d3a840a4c0cc9ca6aab1610b073e}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY=".banco-como-leads-entry.tsx"
ANTES_CRM="app/(root)/crm/llamadas/_banco_antes"
ANTES_MENU="components/chats/_banco_antes"
trap 'rm -rf "$ENTRY" "$ANTES_CRM" "$ANTES_MENU"' EXIT

if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_CRM" "$ANTES_MENU"
  for f in CallsCrmClient.tsx DialogoDeLlamar.tsx CallDetailDialog.tsx rango-de-dias.ts; do
    git show "$ANTES_REF":"app/(root)/crm/llamadas/_components/$f" > "$ANTES_CRM/$f" || {
      echo "no se pudo leer $f de $ANTES_REF; corre 'git fetch origin main'" >&2
      exit 1
    }
  done
  git show "$ANTES_REF":"components/chats/MenuDeLlamada.tsx" > "$ANTES_MENU/MenuDeLlamada.tsx"
  DESDE_TABLA="@/app/(root)/crm/llamadas/_banco_antes/CallsCrmClient"
  DESDE_MENU="@/components/chats/_banco_antes/MenuDeLlamada"
else
  DESDE_TABLA="@/app/(root)/crm/llamadas/_components/CallsCrmClient"
  DESDE_MENU="@/components/chats/MenuDeLlamada"
fi

cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { CallsCrmClient } from "$DESDE_TABLA";
import { MenuDeLlamada } from "$DESDE_MENU";

(window as any).pintarTabla = () => {
    const raiz = ((window as any).__raizTabla ??= createRoot(document.getElementById("pantalla")!));
    raiz.render(React.createElement(CallsCrmClient as any, { embedded: true, cuentas: [], cuentaPropia: "u1" }));
};
(window as any).pintarMenu = () => {
    const raiz = ((window as any).__raizMenu ??= createRoot(document.getElementById("menu")!));
    raiz.render(
        React.createElement(MenuDeLlamada as any, {
            datos: { phone: "573001112233", contactName: "Marta", instanceName: "VERZAY_ATENCION" },
            className: "h-7 w-7",
            iconoClassName: "h-4 w-4",
        }),
    );
};
(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm \
  --outfile=lib/__tests__/.compilado/harness-como-leads.js \
  --alias:@="$(pwd)" \
  --alias:@/actions/calls-crm-actions=./lib/__tests__/fingido/llamadas-del-crm.ts \
  --alias:@/actions/missed-call-reply-actions=./lib/__tests__/fingido/acciones-de-llamadas-mudas.ts \
  --alias:@/actions/voicebot-actions=./lib/__tests__/fingido/acciones-de-llamadas-mudas.ts \
  --alias:@/actions/crm-follow-up-actions=./lib/__tests__/fingido/acciones-de-llamadas-mudas.ts \
  --alias:@/components/chats/AnfitrionDeLlamada=./lib/__tests__/fingido/anfitrion-mudo.ts \
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-mudo.ts \
  --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

echo "── Llamadas como Leads (MODO=$MODO) ──"
node --test lib/__tests__/llamadas-como-leads.test.mjs "$@"
