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
trap 'rm -f "$ENTRY" "$ENTRY.x.tsx"' EXIT

cat > "$ENTRY" <<'TSX'
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { TagFilterPanel } from "__PANEL__";
import { atajoDelRango, rangoDelAtajo } from "@/lib/rango-de-fechas-chats";

// Se exponen las MISMAS funciones que usa el componente, para que el banco
// calcule lo esperado con el reloj del navegador (evita cualquier desfase con
// node) y con la misma lógica que corre en producción.
(window as any).rangoDelAtajo = rangoDelAtajo;
(window as any).atajoDelRango = atajoDelRango;

type Props = {
    tags?: { id: number; name: string; color?: string | null; order: number }[];
    selectedTagIds?: number[];
    rangoDesde?: string;
    rangoHasta?: string;
    campoDeFecha?: "inicio" | "actividad";
    rangoActivo?: boolean;
    /** Con embudos: la cuenta del filtro y lo que devuelve la acción fingida. */
    cuentas?: string[];
    embudos?: unknown[];
    selectedEtapaIds?: string[];
    embudoElegido?: string | null;
};

let root: Root | null = null;
(window as any).calls = [];
(window as any).montar = (p: Props) => {
    root ??= createRoot(document.getElementById("app")!);
    (globalThis as any).__embudosDelBanco = p.embudos ?? [];
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
            cuentas: p.cuentas ?? [],
            cuentaDelFiltro: p.cuentas?.[0] ?? null,
            selectedEtapaIds: new Set<string>(p.selectedEtapaIds ?? []),
            onToggleEtapa: rec("onToggleEtapa"),
            onClearEtapas: rec("onClearEtapas"),
            onElegirEmbudo: rec("onElegirEmbudo"),
            embudoElegido: p.embudoElegido ?? null,
        }),
    );
};
(window as any).listo = true;
TSX

# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` pasa a ser el «después» y el modo roto dejaría de
# reproducir nada. Sus imports son todos `@/…`, así que vive donde sea.
ANTES_REF="${ANTES_REF:-a041144}"
ANTES_TSX="lib/__tests__/.compilado/TagFilterPanel.antes.tsx"
git show "$ANTES_REF:app/(root)/chats/_components/TagFilterPanel.tsx" > "$ANTES_TSX"

construir() { # $1 = el panel, $2 = la salida
    sed "s#__PANEL__#$1#" "$ENTRY" > "$ENTRY.x.tsx"
    npx esbuild "$ENTRY.x.tsx" --bundle --format=esm --outfile="$2" \
        --alias:@/actions/filtro-de-chats-actions=./lib/__tests__/fingido/filtro-de-chats-actions.ts \
        --alias:@="$(pwd)" --loader:.tsx=tsx --jsx=automatic \
        --define:process.env.NODE_ENV='"production"' --log-level=error
    rm -f "$ENTRY.x.tsx"
}
construir "@/app/(root)/chats/_components/TagFilterPanel" "$OUT"
construir "@/$ANTES_TSX" "lib/__tests__/.compilado/harness-panel-filtros-antes.js"

npx esbuild lib/secciones-del-filtro.ts --format=esm --outfile=lib/__tests__/.compilado/secciones-del-filtro.js --log-level=error

rm -f "$ENTRY"

# Sin navegador los casos se SALTAN, y 11 saltados se leen como 11 verdes: aquí
# se exige que haya uno antes de dar nada por bueno.
node -e 'require("playwright")' 2>/dev/null || { echo "MAL: sin playwright, el banco no ejerce nada"; exit 1; }

node --test lib/__tests__/secciones-del-filtro.test.mjs lib/__tests__/panel-de-filtros.test.mjs "$@"

echo
echo "── con el panel de antes (tiene que AFIRMAR el fallo) ──"
MODO=roto node --test lib/__tests__/panel-de-filtros.test.mjs
