#!/usr/bin/env bash
# El banco de los paneles de Chats: uno a la vez, todos por la derecha, y los
# menús de la cabecera colgando de SU botón.
#
# Tres mitades:
#
#   1. Un BARRIDO del código real: la ficha de Contacto entra en la exclusión
#      (`usePanelLateral(PANEL_DE_LA_FICHA, …, { reservar: false })`), «Enviar
#      al equipo» es un `PanelLateral` y no un `Dialog`, y ya no existe la regla
#      de CSS que ponía la ficha ENCIMA de la conversación —a su izquierda—
#      cuando había un panel abierto.
#   2. La EXCLUSIÓN en Chromium, con el hook y el `PanelLateral` reales: abrir
#      un panel cierra la ficha, abrir la ficha cierra el panel, y los dos salen
#      por el mismo lado (el filo derecho).
#   3. Los MENÚS de la cabecera pintados por Radix sobre el CSS del build, con
#      `usePanelFlotante` real y Macros pintado DOS veces —la fila del móvil,
#      escondida, y la de escritorio—, que es exactamente lo que hace
#      `ChatHeader` y lo que la maqueta de `banco-paneles-flotantes` no tenía.
#
# `MODO=roto` construye todo con el código de ANTES_REF (el commit anterior a
# este arreglo, pinchado: `origin/main` se convierte en el «ahora» en cuanto
# esto se fusiona) y AFIRMA los tres fallos de las capturas: la ficha y la
# tarea abiertas a la vez, y los menús de Acciones y Registros cruzando la
# conversación entera.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-bd7f636}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY=".banco-paneles-de-chats-entry.tsx"
OUT="lib/__tests__/.compilado/harness-paneles-de-chats.js"
ANTES_DIR=".banco-antes-paneles"
trap 'rm -rf "$ENTRY" "$ANTES_DIR"' EXIT

HOOK_FLOTANTE="@/hooks/usePanelFlotante"
HOOK_LATERAL="@/hooks/usePanelLateral"
PANEL_LATERAL="@/components/shared/PanelLateral"
if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_DIR/lib" "$ANTES_DIR/hooks" "$ANTES_DIR/components"
  git show "$ANTES_REF:lib/paneles-flotantes.ts" > "$ANTES_DIR/lib/paneles-flotantes.ts"
  git show "$ANTES_REF:hooks/usePanelFlotante.ts" \
    | sed 's#@/lib/paneles-flotantes#../lib/paneles-flotantes#' > "$ANTES_DIR/hooks/usePanelFlotante.ts"
  HOOK_FLOTANTE="./$ANTES_DIR/hooks/usePanelFlotante"
fi

cat > "$ENTRY" <<'TSX'
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePanelFlotante, MARCA_DE_LA_CABECERA, MARCA_DE_MACROS } from "__HOOK_FLOTANTE__";
import { usePanelLateral } from "__HOOK_LATERAL__";
import { PanelLateral } from "__PANEL_LATERAL__";
import { PANEL_DE_LA_TAREA } from "@/lib/panel-lateral";

const ROTO = new URLSearchParams(location.search).get("modo") === "roto";
const FICHA = "panel-ficha-de-contacto";

function Menu({ id, primitiva, marca }: { id: string; primitiva: "menu" | "popover"; marca?: boolean }) {
    const panel = usePanelFlotante("cabecera", primitiva);
    const extra = marca ? { [MARCA_DE_MACROS]: "" } : {};
    const disparador = (
        <button id={id} ref={panel.disparador} {...extra} className="h-8 rounded border px-2 text-xs">
            {id}
        </button>
    );
    const dentro = <div className="p-2 text-sm">Nuevo mensaje · Tomar conversación · Resolver</div>;
    if (primitiva === "popover") {
        return (
            <Popover onOpenChange={panel.alAbrir}>
                <PopoverTrigger asChild>{disparador}</PopoverTrigger>
                <PopoverContent data-panel-del-banco={id} className="w-auto" {...panel.props}>{dentro}</PopoverContent>
            </Popover>
        );
    }
    return (
        <DropdownMenu onOpenChange={panel.alAbrir}>
            <DropdownMenuTrigger asChild>{disparador}</DropdownMenuTrigger>
            <DropdownMenuContent data-panel-del-banco={id} className="w-56" {...panel.props}>{dentro}</DropdownMenuContent>
        </DropdownMenu>
    );
}

/** La ficha: un hermano del flex, como en `chat-main`. En el modo roto va sin
 *  la exclusión, que es como estaba (el barrido lo comprueba en el fichero). */
function Ficha({ abierta, cerrar }: { abierta: boolean; cerrar: () => void }) {
    if (!ROTO) (usePanelLateral as any)(FICHA, abierta, cerrar, { reservar: false });
    if (!abierta) return null;
    return <aside data-ficha-de-contacto className="w-[var(--ancho-lateral)] shrink-0 border-l">Contacto</aside>;
}

function Maqueta() {
    const [ficha, setFicha] = useState(false);
    const [tarea, setTarea] = useState(false);
    (window as any).abrir = (cual: string, v: boolean) => (cual === "ficha" ? setFicha(v) : setTarea(v));
    (window as any).estado = () => ({ ficha, tarea });
    return (
        <div className="flex h-screen flex-col">
            <div className="h-16 shrink-0 border-b" />
            <div className="flex min-h-0 flex-1">
                <nav className="w-12 shrink-0 border-r" />
                <aside className="w-[var(--ancho-lateral)] shrink-0 border-r" />
                <div data-chat-view className="flex min-w-0 flex-1">
                    <section id="conversacion" className="flex min-w-0 flex-1 flex-col">
                        <div {...{ [MARCA_DE_LA_CABECERA]: "" }} className="shrink-0 border-b backdrop-blur-sm">
                            {/* La fila del MÓVIL, escondida en escritorio: con su propio Macros. */}
                            <div className="md:hidden px-2 py-2">
                                <Menu id="macrosMovil" primitiva="menu" marca />
                            </div>
                            <div className="hidden md:flex md:flex-col">
                                <div className="flex items-center gap-1 px-4 py-2">
                                    <span className="flex-1 truncate text-sm">YAIR ENRRIQUE SILVERA VEGA</span>
                                    <button className="h-8 w-8 rounded border">a</button>
                                    <Menu id="registros" primitiva="popover" />
                                    <button className="h-8 w-8 rounded border">b</button>
                                    <button className="h-8 w-8 rounded border">c</button>
                                    <button className="h-8 w-8 rounded border">d</button>
                                </div>
                                <div className="flex items-center gap-1 px-4 pb-2">
                                    <span className="flex-1 text-sm">Mensajes · Notas · Copiloto</span>
                                    <Menu id="macros" primitiva="menu" marca />
                                    <Menu id="acciones" primitiva="menu" />
                                </div>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1" />
                    </section>
                    <Ficha abierta={ficha} cerrar={() => setFicha(false)} />
                </div>
            </div>
            <PanelLateral id={PANEL_DE_LA_TAREA} abierto={tarea} onCerrar={() => setTarea(false)} titulo="Nueva tarea">
                <div className="p-4">Descripción</div>
            </PanelLateral>
        </div>
    );
}

createRoot(document.getElementById("app")!).render(<Maqueta />);
(window as any).listo = true;
TSX

sed -i "s#__HOOK_FLOTANTE__#${HOOK_FLOTANTE}#; s#__HOOK_LATERAL__#${HOOK_LATERAL}#; s#__PANEL_LATERAL__#${PANEL_LATERAL}#" "$ENTRY"

npx esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT" \
  --alias:@="$(pwd)" \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

node --test lib/__tests__/paneles-de-chats.test.mjs "$@"
