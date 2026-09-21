#!/usr/bin/env bash
# El banco del PANEL DEL EMBUDO de Chats (rango de fechas + etiquetas), en un
# navegador de verdad.
#
# El rango de fechas se movió del menú «⋯» a este panel. Aquí se comprueba el
# panel real (`TagFilterPanel`) con sus dos secciones:
#   - con RANGO solo,
#   - con ETIQUETAS solas,
#   - con LOS DOS a la vez,
#   - y que el «Limpiar» de cada uno toca SOLO lo suyo.
# Más que el botón del embudo se marca activo con cualquiera de los dos, que
# «Inicio de conversación» no se parte en dos renglones y que los campos de
# fecha no se cortan.
#
# Empaqueta el componente real + un arnés con esbuild, desde la raíz para que
# resuelva `react` y `@radix-ui`, en `.compilado/` (que está en .gitignore).
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

ENTRY=".banco-panel-filtros-entry.tsx"
OUT="lib/__tests__/.compilado/harness-panel-filtros.js"
mkdir -p "$(dirname "$OUT")"
trap 'rm -f "$ENTRY"' EXIT

cat > "$ENTRY" <<'TSX'
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { TagFilterPanel } from "@/app/(root)/chats/_components/TagFilterPanel";

type Props = {
    tags?: { id: number; name: string; color?: string | null; order: number }[];
    selectedTagIds?: number[];
    rangoDesde?: string;
    rangoHasta?: string;
    campoDeFecha?: "inicio" | "actividad";
    rangoActivo?: boolean;
};

let root: Root | null = null;
(window as any).calls = [];
(window as any).montar = (p: Props) => {
    root ??= createRoot(document.getElementById("app")!);
    const rec = (nombre: string) => (...args: unknown[]) => (window as any).calls.push([nombre, ...args]);
    root.render(
        React.createElement(TagFilterPanel, {
            tags: (p.tags ?? []) as any,
            selectedTagIds: new Set<number>(p.selectedTagIds ?? []),
            rangoDesde: p.rangoDesde ?? "",
            rangoHasta: p.rangoHasta ?? "",
            campoDeFecha: p.campoDeFecha ?? "inicio",
            rangoActivo: p.rangoActivo ?? false,
            onToggleTag: rec("onToggleTag"),
            onClearFilter: rec("onClearFilter"),
            onRangoDesde: rec("onRangoDesde"),
            onRangoHasta: rec("onRangoHasta"),
            onCampoDeFecha: rec("onCampoDeFecha"),
            onLimpiarRango: rec("onLimpiarRango"),
        }),
    );
};
(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT" \
    --alias:@="$(pwd)" --loader:.tsx=tsx --jsx=automatic \
    --define:process.env.NODE_ENV='"production"' --log-level=error

rm -f "$ENTRY"

node --test lib/__tests__/panel-de-filtros.test.mjs "$@"
