#!/usr/bin/env bash
# El banco de la RUEDITA del menú «Macros» de Chats.
#
# Al lanzar una macro desde la cabecera de una conversación sale una ruedita en
# su fila mientras corre. Iba al FINAL de la fila, así que le quitaba su ancho
# al nombre: en el vídeo de la guía «Marcar como caliente» se leía «Marcar como
# cali…» justo cuando se lanzaba. Ahora la ruedita ocupa el hueco del punto de
# color, que mide lo mismo con punto o con ruedita: el nombre no se mueve.
#
# Se prueba en Chromium, sobre el CSS del build y con Poppins, con el
# `MacrosMenu` REAL: el menú es de Radix, se monta en un portal y solo al
# abrirlo, y el ancho de su panel sale de medir la fila de Macros y Acciones
# (`usePanelFlotante('cabecera')`). Sin navegador no hay nada que medir.
#
# `MODO=roto` monta el `MacrosMenu` de un commit PINCHADO —nunca `origin/main`,
# que deja de ser el «antes» en cuanto esto se fusiona— y afirma el fallo: el
# nombre encoge y sale recortado mientras gira la ruedita.
#
# Uso:  scripts/banco-ruedita-de-macros.sh
#       MODO=roto scripts/banco-ruedita-de-macros.sh   <- afirma el fallo
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
# El commit en el que la ruedita iba al final de la fila.
ANTES_REF="${ANTES_REF:-7c6869fa0c2c5fcfa3312a2211b8f12a06de6912}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY=".banco-ruedita-entry.tsx"
ANTES=".banco-macros-menu-antes.tsx"
trap 'rm -f "$ENTRY" "$ANTES"' EXIT

if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:app/(root)/chats/_components/MacrosMenu.tsx" > "$ANTES"
  DESDE="@/$(basename "$ANTES" .tsx)"
else
  DESDE="@/app/(root)/chats/_components/MacrosMenu"
fi

cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MacrosMenu } from "$DESDE";

// La macro que se lanza NO termina hasta que el banco lo diga: así la ruedita
// se queda girando todo lo que haga falta para medirla.
(window as any).lanzadas = [];
const correr = (id: string) =>
    new Promise<void>((suelta) => {
        (window as any).lanzadas.push(id);
        (window as any).soltarLaMacro = () => suelta();
    });

// La cabecera de una conversación de verdad, reducida a lo que decide el
// ancho del panel: la fila de Macros y Acciones pegada al filo derecho, con el
// margen de la cabecera (6 px) y los mismos botones y clases que \`ChatHeader\`.
(window as any).pintar = (izquierda: number) => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("app")!));
    raiz.render(
        React.createElement(
            "div",
            {
                "data-cabecera-de-chat": "",
                style: { position: "absolute", left: izquierda, right: 0, top: 60, padding: 6 },
                className: "flex justify-end border-b-2 bg-background",
            },
            React.createElement(
                "div",
                { "data-mandos-de-la-fila": "", className: "flex shrink-0 items-center gap-1 pl-1" },
                React.createElement(
                    Button,
                    { type: "button", variant: "ghost", size: "icon", className: "h-7 w-7 shrink-0 rounded-md" },
                    React.createElement(Search, { className: "h-3.5 w-3.5" }),
                ),
                React.createElement(MacrosMenu as any, { onRunMacro: correr }),
                React.createElement(
                    Button,
                    { size: "sm", variant: "secondary", className: "h-8 md:h-7 gap-1.5 px-2.5 text-sm" },
                    "Acciones",
                    React.createElement(ChevronDown, { className: "h-3 w-3" }),
                ),
            ),
        ),
    );
};
(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm \
  --outfile=lib/__tests__/.compilado/harness-ruedita-de-macros.js \
  --alias:@="$(pwd)" \
  --alias:@/actions/macro-actions=./lib/__tests__/fingido/macros-del-menu-del-chat.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

echo "── la ruedita del menú «Macros» de Chats (MODO=$MODO) ──"
node --test lib/__tests__/ruedita-de-macros.test.mjs "$@"
