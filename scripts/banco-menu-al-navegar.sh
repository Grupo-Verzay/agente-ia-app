#!/usr/bin/env bash
# El menú lateral se COMPRIME solo al entrar a cualquier sección, no solo en
# Chats. Dos mitades:
#
#   1. La regla pura (`lib/menu-al-navegar.ts`) y un barrido del layout.
#   2. El `SidebarProvider` de verdad con la pieza de verdad, en Chromium.
#
# `MODO=roto` corre la regla de antes (solo Chats) y monta el proveedor SIN la
# pieza, como estaba el layout, y AFIRMA el fallo: entrar a Correo dejaba el
# menú abierto.
#
# Uso:  scripts/banco-menu-al-navegar.sh
#       MODO=roto scripts/banco-menu-al-navegar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"

MAYOR="$(npx tsc --version | sed -E 's/^Version ([0-9]+).*/\1/')"
SIN_CONFIG=""
if [ "${MAYOR:-0}" -ge 6 ]; then SIN_CONFIG="--ignoreConfig"; fi
npx tsc lib/menu-al-navegar.ts --outDir lib/__tests__/.compilado/menu-al-navegar \
  --module es2022 --target es2022 --lib es2022,dom \
  --moduleResolution bundler --skipLibCheck $SIN_CONFIG

echo "── la regla (MODO=$MODO) ──"
node --test lib/__tests__/menu-al-navegar.test.mjs

ENTRY=".banco-menu-al-navegar-entry.tsx"
trap 'rm -f "$ENTRY"' EXIT
if [ "$MODO" = "roto" ]; then PIEZA="null"; else PIEZA="React.createElement(ComprimirMenuAlNavegar)"; fi
cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { ComprimirMenuAlNavegar } from "@/components/ComprimirMenuAlNavegar";
// La ruta la mueve el banco; se importa aquí también para el modo roto, que no monta la pieza.
import "next/navigation";

function Sonda() {
  const { state, setOpen } = useSidebar();
  return React.createElement("div", { "data-banco-estado": state },
    React.createElement("button", { "data-banco-abrir": "", onClick: () => setOpen(true) }, "abrir"));
}
(window as any).pintar = (abierto: boolean) => {
  document.cookie = "sidebar_state=; max-age=0; path=/";
  createRoot(document.getElementById("pantalla")!).render(
    React.createElement(SidebarProvider, { defaultOpen: abierto }, $PIEZA, React.createElement(Sonda)),
  );
};
(window as any).listo = true;
TSX
node scripts/empaquetar-con-acciones-mudas.mjs \
  "$ENTRY" lib/__tests__/.compilado/harness-menu-al-navegar.js \
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-con-ruta.ts

echo "── el menú de verdad en Chromium (MODO=$MODO) ──"
node --test lib/__tests__/menu-al-navegar-navegador.test.mjs
