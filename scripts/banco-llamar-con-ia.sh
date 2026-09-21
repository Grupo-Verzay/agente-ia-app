#!/usr/bin/env bash
# El banco de «Llamar con IA»: el menú de la cabecera de Chats y la barra del
# marcador de CRM › Llamadas.
#
# Son DOS mitades porque el cambio vive en dos capas y cada una se rompe de una
# forma distinta:
#
#   1. `menu-de-llamada.test.mjs` — en Chromium, con el componente REAL y el
#      `startBotCallAction` apuntado: cada opción del menú dispara SU llamada,
#      y las dos van por la LÍNEA de la conversación abierta. Radix monta el
#      menú en un portal y solo al abrirlo, así que sin navegador el `onSelect`
#      de cada opción no se ejecuta nunca.
#   2. `barra-del-marcador.test.mjs` — en Chromium y sobre el CSS del build:
#      una fila en computador, dos renglones en el teléfono, y nada recortado,
#      fuera de la tarjeta ni desbordando la página.
#
# Las dos corren en dos modos:
#
#   - el menú, con la versión INGENUA —la que sale de copiar el manejador del
#     marcador, `startBotCallAction(digitos)` sin línea— y afirma que la pierde.
#     No es «el componente de antes», porque este menú es nuevo: es la forma en
#     que esto se escribe solo, y se dice en vez de disimularlo.
#   - la barra, con los DOS bloques de `origin/main` sacados con `git show`:
#     el recuadro «Marcador» con su palabra, su icono y su «Rellamar:», y la
#     cabecera «Historial» con los conteos y los filtros dos bloques más abajo.
#
# Uso:  scripts/banco-llamar-con-ia.sh
#       MODO=roto scripts/banco-llamar-con-ia.sh   <- afirma los fallos
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
# Playwright va instalado en el sistema, no en el proyecto.
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY_MENU=".banco-menu-entry.tsx"
ENTRY_BARRA=".banco-barra-entry.tsx"
INGENUO=".banco-menu-ingenuo.tsx"
ANTES=".banco-marcador-antes.tsx"
trap 'rm -f "$ENTRY_MENU" "$ENTRY_BARRA" "$INGENUO" "$ANTES"' EXIT

# ─────────────────────────────────────────────────────────────────────────────
# 1. El menú de la cabecera de Chats
# ─────────────────────────────────────────────────────────────────────────────
if [ "$MODO" = "roto" ]; then
  # La versión ingenua: el mismo menú, con el manejador del marcador copiado
  # tal cual. Lo único que cambia es que la línea no viaja.
  cat > "$INGENUO" <<'TSX'
"use client";
import { useState } from "react";
import { Bot, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { abrirLlamadaAqui, type DatosDeLaLlamada } from "@/components/chats/AnfitrionDeLlamada";
import { startBotCallAction } from "@/actions/voicebot-actions";

/** El menú escrito de la forma en que se escribe solo: sin pasar la línea. */
export function MenuDeLlamada({ datos }: { datos: DatosDeLaLlamada }) {
    const [, setNada] = useState(false);
    const digitos = (datos.phone ?? "").replace(/\D/g, "");
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" data-menu-llamada aria-label="Llamar">
                    <Phone className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem
                    data-opcion="llamar"
                    onSelect={() => abrirLlamadaAqui({ ...datos, phone: digitos })}
                >
                    <Phone className="mr-2 h-4 w-4" /> Llamar
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-opcion="llamar-ia"
                    onSelect={() => {
                        setNada(true);
                        void startBotCallAction(digitos);
                    }}
                >
                    <Bot className="mr-2 h-4 w-4" /> Llamar con IA
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
TSX
  DESDE_MENU="@/.banco-menu-ingenuo"
else
  DESDE_MENU="@/components/chats/MenuDeLlamada"
fi

cat > "$ENTRY_MENU" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { MenuDeLlamada } from "$DESDE_MENU";

// El evento de verdad que escucha el anfitrión del layout. Se anota aquí para
// poder afirmar QUÉ salió y con qué línea; \`abrirLlamadaAqui\` es el de verdad.
window.addEventListener("llamada:abrir", (e: any) => {
    ((window as any).__abiertas ??= []).push(e.detail);
});

(window as any).pintarMenu = (datos: any) => {
    const raiz = ((window as any).__raizMenu ??= createRoot(document.getElementById("menu")!));
    raiz.render(React.createElement(MenuDeLlamada as any, { datos }));
};
(window as any).listo = true;
TSX

npx esbuild "$ENTRY_MENU" --bundle --format=esm \
  --outfile=lib/__tests__/.compilado/harness-menu-de-llamada.js \
  --alias:@="$(pwd)" \
  --alias:@/app/\(root\)/chats/_components/CallDialog=./lib/__tests__/fingido/dialogo-de-llamada-mudo.tsx \
  --alias:@/actions/voicebot-actions=./lib/__tests__/fingido/voicebot-del-menu.ts \
  --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

echo "── el menú de la cabecera de Chats (MODO=$MODO) ──"
node --test lib/__tests__/menu-de-llamada.test.mjs "$@"

# ─────────────────────────────────────────────────────────────────────────────
# 2. La barra del marcador de CRM › Llamadas
# ─────────────────────────────────────────────────────────────────────────────
if [ "$MODO" = "roto" ]; then
  # El «antes» NO se escribe a mano: los dos bloques salen de `origin/main` con
  # `git show`, recortados por sus propios comentarios. Copiados, este modo
  # mediría lo que alguien recuerda de la pantalla vieja.
  git fetch origin main --quiet 2>/dev/null || true
  python3 scripts/sacar-marcador-de-antes.py "$ANTES"
  DESDE_BARRA="@/.banco-marcador-antes"
else
  DESDE_BARRA="@/app/(root)/crm/llamadas/_components/BarraDelMarcador"
fi

cat > "$ENTRY_BARRA" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { Phone, PhoneOutgoing, PhoneMissed } from "lucide-react";
import { BarraDelMarcador } from "$DESDE_BARRA";

const DIRECCIONES = [
    { label: "Todas", value: "all" },
    { label: "Salientes", value: "outgoing" },
    { label: "Entrantes", value: "incoming" },
];

/** Cifras de una cuenta con tráfico de verdad: las que más ancho piden. */
const KPIS = { total: 1284, outgoing: 742, incoming: 542, answered: 903 };

function Demo() {
    const [numero, setNumero] = React.useState("");
    const [direccion, setDireccion] = React.useState("all");
    return React.createElement(BarraDelMarcador as any, {
        numero,
        alEscribir: setNumero,
        alLlamar: () => {},
        alLlamarConIa: () => {},
        llamandoConIa: false,
        direcciones: DIRECCIONES,
        direccion,
        alCambiarDireccion: setDireccion,
        // El «antes» los pinta desde \`kpis\`; el de ahora, desde \`metricas\`.
        kpis: KPIS,
        metricas: [
            { clave: "all", icono: React.createElement(Phone), etiqueta: "Total", valor: KPIS.total, color: "#3B82F6", alPulsar: () => setDireccion("all"), activa: direccion === "all" },
            { clave: "outgoing", icono: React.createElement(PhoneOutgoing), etiqueta: "Salientes", valor: KPIS.outgoing, color: "#22C55E", alPulsar: () => setDireccion("outgoing"), activa: direccion === "outgoing" },
            { clave: "incoming", icono: React.createElement(PhoneMissed), etiqueta: "Entrantes", valor: KPIS.incoming, color: "#EF4444", alPulsar: () => setDireccion("incoming"), activa: direccion === "incoming" },
        ],
    });
}

(window as any).pintarBarra = () => {
    const raiz = ((window as any).__raizBarra ??= createRoot(document.getElementById("barra")!));
    // La misma caja que la pantalla: \`flex flex-col gap-3\`.
    raiz.render(React.createElement("div", { className: "flex flex-col gap-3" }, React.createElement(Demo)));
};
(window as any).listo = true;
TSX

npx esbuild "$ENTRY_BARRA" --bundle --format=esm \
  --outfile=lib/__tests__/.compilado/harness-barra-del-marcador.js \
  --alias:@="$(pwd)" \
  --alias:@/components/chats/AnfitrionDeLlamada=./lib/__tests__/fingido/anfitrion-mudo.ts \
  --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

echo
echo "── la barra del marcador (MODO=$MODO) ──"
node --test lib/__tests__/barra-del-marcador.test.mjs "$@"
