#!/usr/bin/env bash
# El banco de los paneles flotantes de Chats.
#
# Son DOS mitades, porque el cambio vive en dos capas y cada una se rompe de
# una forma distinta:
#
#   1. `paneles-flotantes.test.mjs` — la DECISIÓN, pura y sin navegador: dónde
#      nace cada panel, qué marca «marcar leídas», qué ids acepta resolver en
#      lote y dónde va la barrita de formato. Su `MODO=roto` saca de
#      `origin/main` con `git show` las colocaciones que había y afirma el
#      desorden: cuatro alineaciones distintas para la misma pregunta y ni un
#      solo panel colocado contra su contenedor.
#   2. `paneles-flotantes-dom.test.mjs` — los paneles PINTADOS por Radix, sobre
#      el CSS del build, en las cuatro anchuras y en móvil. Es lo único que
#      puede decir si Radix hace con esos números lo que se espera: el signo de
#      `alignOffset` depende de la alineación y escribirlo al revés no da
#      ningún error, solo deja el panel al otro lado.
#
# El «antes» de la segunda mitad NO se escribe aquí: se saca de `origin/main`
# igual que el de la primera, y el arnés pinta los mismos paneles con esas
# props. Copiado, el modo roto mediría lo que alguien recuerda.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO

# ─────────────────────────────────────────────────────────────────────────────
# 1. La decisión, sin navegador
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p lib/__tests__/.compilado
npx tsc lib/paneles-flotantes.ts lib/campana.ts lib/barrita-de-formato.ts lib/borrado-en-bloque.ts \
  --outDir lib/__tests__/.compilado \
  --module esnext --target es2022 --moduleResolution bundler --skipLibCheck

node --test lib/__tests__/paneles-flotantes.test.mjs "$@"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Los paneles de verdad, en Chromium
# ─────────────────────────────────────────────────────────────────────────────
if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

ENTRY=".banco-paneles-entry.tsx"
OUT="lib/__tests__/.compilado/harness-paneles.js"
ANTES="lib/__tests__/.compilado/colocaciones-de-antes.json"
trap 'rm -f "$ENTRY"' EXIT

# Las colocaciones del «antes». El arnés las lee y pinta los mismos paneles con
# ellas cuando MODO=roto. El commit del que salen lo dice
# `lib/__tests__/el-antes-de-los-paneles.json` — no `origin/main`, donde la
# unificación ya está fusionada y el modo roto se pondría verde sin ejercer nada.
git fetch origin main --quiet 2>/dev/null || true
node - "$ANTES" <<'NODE'
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

// De dónde sale el «antes». Escrito en un JSON y no aquí porque lo leen los
// DOS —este arnés y el banco puro—, y con el ref copiado en los dos, el día
// que se mueva uno el otro mediría otra cosa. En una frase: NO puede ser
// `origin/main`, porque la unificación ya está fusionada ahí.
const EL_ANTES = JSON.parse(
  fs.readFileSync("lib/__tests__/el-antes-de-los-paneles.json", "utf8"),
).ref;

// Qué panel de la maqueta corresponde a qué `<…Content>` de qué fichero. El
// índice es el orden en que aparecen en el fichero: hay ficheros con más de uno.
const DE_DONDE = {
  canales:     ["app/(root)/chats/_components/ChatSearchBar.tsx", 0],
  etiquetas:   ["app/(root)/chats/_components/TagFilterPanel.tsx", 0],
  mas:         ["app/(root)/chats/_components/ChatTabBar.tsx", 0],
  temperatura: ["app/(root)/chats/_components/LeadStatusSelect.tsx", 0],
  filaAsesor:  ["app/(root)/chats/_components/AdvisorAssignBadge.tsx", 0],
  filaAbajo:   ["app/(root)/chats/_components/AdvisorAssignBadge.tsx", 0],
  hMacros:     ["app/(root)/chats/_components/MacrosMenu.tsx", 0],
  hRegistros:  ["app/(root)/chats/_components/ChatRegistrosBadge.tsx", 0],
  hCita:       ["app/(root)/chats/_components/ChatAppointmentStatusButton.tsx", 0],
  hAcciones:   ["app/(root)/chats/_components/ChatHeader.tsx", 0],
  campana:     ["components/shared/NotificationCenter.tsx", 0],
};

const cache = new Map();
function bloques(fichero) {
  if (!cache.has(fichero)) {
    const texto = execFileSync("git", ["show", `${EL_ANTES}:${fichero}`], { encoding: "utf8" });
    // `(?:[^>]|=>)` por los `onClick={(e) => …}` que llevan dentro: cortando en
    // el primer `>` el bloque se queda a medias y se pierde el `side`.
    cache.set(fichero, texto.match(/<(?:PopoverContent|DropdownMenuContent)(?:[^>]|=>)*?>/g) ?? []);
  }
  return cache.get(fichero);
}

const salida = {};
for (const [id, [fichero, i]] of Object.entries(DE_DONDE)) {
  const b = bloques(fichero)[i];
  if (!b) throw new Error(`no se encontró el panel de ${fichero} en ${EL_ANTES}`);
  salida[id] = {
    align: /align="(start|end|center)"/.exec(b)?.[1] ?? "start",
    side: /side="(top|bottom)"/.exec(b)?.[1] ?? "bottom",
    sideOffset: Number(/sideOffset=\{(\d+)\}/.exec(b)?.[1] ?? 4),
    collisionPadding: Number(/collisionPadding=\{(\d+)\}/.exec(b)?.[1] ?? 0),
    // El ancho que pedía, que es la otra mitad de por qué se salían.
    ancho: /w-\[?([\w.%()]+)\]?/.exec(b)?.[1] ?? null,
  };
}
// Los que no tenían panel propio en el «antes» heredan el de su hermano: los
// tres de la fila de iconos de la cabecera eran el mismo `align="end"`.
for (const id of ["asesor", "fechas", "filaMas", "hAsesor", "hEtiquetas", "largo"]) {
  salida[id] ??= { align: "end", side: "bottom", sideOffset: 4, collisionPadding: 0, ancho: null };
}
fs.writeFileSync(process.argv[2], JSON.stringify(salida, null, 2));
console.log(`el «antes» de ${Object.keys(salida).length} paneles, sacado de ${EL_ANTES.slice(0, 7)}`);
NODE

cat > "$ENTRY" <<'TSX'
import React from "react";
import { createRoot } from "react-dom/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    usePanelFlotante,
    MARCA_DE_LA_BARRA,
    MARCA_DE_LA_CABECERA,
    MARCA_DE_LA_COLUMNA,
    MARCA_DE_LAS_PASTILLAS,
    type ClaseDePanel,
} from "@/hooks/usePanelFlotante";
import { PANEL_QUE_SE_DESPLAZA } from "@/lib/paneles-flotantes";
import ANTES from "./lib/__tests__/.compilado/colocaciones-de-antes.json";

const ROTO = new URLSearchParams(location.search).get("modo") === "roto";

/**
 * Un panel del banco.
 *
 * Monta el hook y la primitiva DE VERDAD. En `MODO=roto` se le pasan las props
 * que ese mismo panel tenía en `origin/main` —leídas de ahí, no escritas aquí—
 * y se le quita el estilo medido, que es lo que había: nadie medía nada.
 */
function Panel({
    id,
    clase,
    primitiva,
    contenedor,
    ancho,
    filas = 6,
    children,
}: {
    id: string;
    clase: ClaseDePanel;
    primitiva: "popover" | "menu";
    contenedor: string;
    ancho?: string;
    filas?: number;
    children?: React.ReactNode;
}) {
    const panel = usePanelFlotante(clase, primitiva);
    const viejo = (ANTES as any)[id];

    const props = ROTO
        ? {
              side: viejo.side,
              align: viejo.align,
              alignOffset: 0,
              sideOffset: viejo.sideOffset,
              avoidCollisions: true,
              collisionPadding: viejo.collisionPadding,
              style: {},
          }
        : panel.props;

    const dentro = (
        <>
            {Array.from({ length: filas }, (_, i) => (
                <div key={i} className="px-2 py-1.5 text-sm">
                    Opción número {i + 1} de este panel
                </div>
            ))}
            {children}
        </>
    );

    const claseDelPanel = [ROTO ? (ancho ?? "w-56") : "", PANEL_QUE_SE_DESPLAZA, "p-1"]
        .filter(Boolean)
        .join(" ");

    if (primitiva === "popover") {
        return (
            <Popover onOpenChange={panel.alAbrir}>
                <PopoverTrigger asChild>
                    <button id={id} ref={panel.disparador} className="h-8 w-8 rounded border text-xs">
                        ·
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    data-panel-del-banco=""
                    data-contenedor={contenedor}
                    className={claseDelPanel}
                    {...props}
                >
                    {dentro}
                </PopoverContent>
            </Popover>
        );
    }

    return (
        <DropdownMenu onOpenChange={panel.alAbrir}>
            <DropdownMenuTrigger asChild>
                <button id={id} ref={panel.disparador} className="h-8 w-8 rounded border text-xs">
                    ·
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                data-panel-del-banco=""
                data-contenedor={contenedor}
                className={claseDelPanel}
                {...props}
            >
                {dentro}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * La maqueta: la misma FORMA que Chats, con las cuatro marcas del DOM puestas.
 *
 * No monta la pantalla entera a propósito: lo que se mide es dónde cae un panel
 * respecto de su contenedor, y para eso hacen falta las cajas —el carril de
 * iconos, la columna con su fila de pastillas, la conversación con su cabecera
 * y la barra de arriba—, no las miles de filas de la lista.
 */
function Maqueta({ carril, columna }: { carril: number; columna: number }) {
    return (
        <div className="flex h-screen flex-col">
            {/* La barra de arriba de la plataforma. */}
            <header
                {...{ [MARCA_DE_LA_BARRA]: "" }}
                className="flex h-16 shrink-0 items-center justify-end border-b px-3"
            >
                <Panel id="campana" clase="barraDeArriba" primitiva="menu" contenedor={MARCA_DE_LA_BARRA} ancho="w-[min(92vw,380px)]" filas={10} />
            </header>

            <div className="flex min-h-0 flex-1">
                {/* El carril de iconos: en un móvil no existe. */}
                <nav className="shrink-0 border-r" style={{ width: carril }} />

                {/* La columna de la lista. */}
                <aside
                    {...{ [MARCA_DE_LA_COLUMNA]: "" }}
                    className="flex shrink-0 flex-col border-r"
                    style={{ width: columna }}
                >
                    <div className="flex items-center gap-1 px-2 py-2">
                        <Panel id="canales" clase="columnaAncha" primitiva="menu" contenedor={MARCA_DE_LA_COLUMNA} ancho="w-56" />
                        <Panel id="asesor" clase="columnaAncha" primitiva="menu" contenedor={MARCA_DE_LA_COLUMNA} ancho="w-56" />
                        <Panel id="fechas" clase="columnaAncha" primitiva="popover" contenedor={MARCA_DE_LA_COLUMNA} ancho="w-64" />
                        <Panel id="etiquetas" clase="columnaAncha" primitiva="popover" contenedor={MARCA_DE_LA_COLUMNA} ancho="w-72" />
                    </div>

                    {/* La fila de pastillas: lo que ningún panel ancho puede tapar. */}
                    <div
                        {...{ [MARCA_DE_LAS_PASTILLAS]: "" }}
                        className="flex items-center gap-1 px-2 pb-2"
                    >
                        <span className="rounded-full border px-2 py-0.5 text-xs">Mías</span>
                        <span className="rounded-full border px-2 py-0.5 text-xs">Todos</span>
                        <span className="rounded-full border px-2 py-0.5 text-xs">Sin leer</span>
                        <span className="rounded-full border px-2 py-0.5 text-xs">En espera</span>
                        <span className="ml-auto">
                            <Panel id="mas" clase="columnaAncha" primitiva="menu" contenedor={MARCA_DE_LA_COLUMNA} ancho="w-44" />
                        </span>
                    </div>

                    {/* Una fila de chat, con sus tres controles. */}
                    <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex items-center gap-1 border-b px-2 py-3">
                            <span className="flex-1 truncate text-sm">Marta Restrepo</span>
                            <Panel id="temperatura" clase="columnaDerecha" primitiva="menu" contenedor={MARCA_DE_LA_COLUMNA} ancho="w-40" />
                            <Panel id="filaAsesor" clase="columnaDerecha" primitiva="popover" contenedor={MARCA_DE_LA_COLUMNA} ancho="w-56" />
                            <Panel id="filaMas" clase="columnaDerecha" primitiva="menu" contenedor={MARCA_DE_LA_COLUMNA} ancho="w-48" />
                        </div>

                        <div className="flex-1" />

                        {/* La última fila, pegada al borde de abajo: la que tiene
                            que abrir su panel hacia ARRIBA. */}
                        <div className="flex items-center gap-1 border-t px-2 py-3">
                            <span className="flex-1 truncate text-sm">Última de la lista</span>
                            <Panel id="filaAbajo" clase="columnaDerecha" primitiva="popover" contenedor={MARCA_DE_LA_COLUMNA} ancho="w-56" filas={8} />
                            <Panel id="largo" clase="columnaDerecha" primitiva="menu" contenedor={MARCA_DE_LA_COLUMNA} ancho="w-48" filas={100} />
                        </div>
                    </div>
                </aside>

                {/* El área de conversación. */}
                <section className="flex min-w-0 flex-1 flex-col">
                    <div {...{ [MARCA_DE_LA_CABECERA]: "" }} className="shrink-0 border-b">
                        <div className="flex items-center gap-1 px-3 py-2">
                            <span className="flex-1 truncate text-sm">Marta Restrepo</span>
                            <Panel id="hAsesor" clase="cabecera" primitiva="popover" contenedor={MARCA_DE_LA_CABECERA} ancho="w-56" />
                            <Panel id="hRegistros" clase="cabecera" primitiva="popover" contenedor={MARCA_DE_LA_CABECERA} ancho="w-52" />
                            <Panel id="hCita" clase="cabecera" primitiva="popover" contenedor={MARCA_DE_LA_CABECERA} ancho="w-64" />
                            <Panel id="hEtiquetas" clase="cabecera" primitiva="popover" contenedor={MARCA_DE_LA_CABECERA} ancho="w-72" />
                        </div>
                        {/* La fila de Macros y Acciones: la que no se puede tapar. */}
                        <div className="flex items-center gap-1 px-3 pb-2">
                            <Panel id="hMacros" clase="cabecera" primitiva="menu" contenedor={MARCA_DE_LA_CABECERA} ancho="w-56" />
                            <Panel id="hAcciones" clase="cabecera" primitiva="menu" contenedor={MARCA_DE_LA_CABECERA} ancho="w-56" />
                        </div>
                    </div>
                    <div className="min-h-0 flex-1" />
                </section>
            </div>
        </div>
    );
}

(window as any).maqueta = ({ carril, columna }: { carril: number; columna: number }) => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("app")!));
    raiz.render(React.createElement(Maqueta, { carril, columna }));
};

(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT" \
  --alias:@="$(pwd)" \
  --loader:.tsx=tsx --loader:.json=json --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

rm -f "$ENTRY"

node --test lib/__tests__/paneles-flotantes-dom.test.mjs "$@"

# ─────────────────────────────────────────────────────────────────────────────
# 3. La simetría de las dos filas de la cabecera, también en Chromium
# ─────────────────────────────────────────────────────────────────────────────
# Aparte de la mitad de arriba porque no necesita el arnés de React: se pintan
# las dos filas con las clases REALES del componente, leídas de él. Y su
# «antes» es OTRO —`origin/main`, que es donde la fila va con `px-3` y el grupo
# con `pr-2`—: cada cambio se compara contra el estado anterior al SUYO.
node --test lib/__tests__/cabecera-simetrica.test.mjs "$@"
