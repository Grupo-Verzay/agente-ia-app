#!/usr/bin/env bash
# El banco de los tres controles del anfitrión de una reunión.
#
#   1. Sacar a alguien que ya está dentro.
#   2. Pedirle que se silencie.
#   3. Que SUENE cuando alguien llama a la puerta, repitiéndose mientras
#      espere y parando al admitirlo o rechazarlo.
#
# Los tres existían a medias y de tres formas distintas: los dos primeros solo
# dentro del panel lateral —que nace plegado, y en su pestaña de chat—, o sea
# una puerta abierta sin ningún menú que llevara a ella; el tercero no existía
# en absoluto.
#
# Dos mitades, porque el cambio vive en dos capas:
#
#   - **La decisión y el barrido**, sin navegador: qué se ofrece, cuándo suena,
#     y que los dos sitios que pintan los mandos salen de la MISMA función y
#     del MISMO camino.
#   - **Los componentes REALES en Chromium**: que el menú del recuadro se
#     ALCANZA —no basta con que exista: la cabecera y la barra de mandos flotan
#     encima del video— y que el sonido suena, se repite y para.
#
# `MODO=roto` corre el «antes», pinchado a un commit (ver
# `lib/__tests__/el-antes-de-los-controles.json`) y **afirma el fallo**.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"

if [ "$MODO" = "roto" ]; then
  echo "── MODO=roto: el «antes», sacado de git ─────────────────────────────"
  node --test lib/__tests__/controles-de-la-reunion-antes.test.mjs
  exit 0
fi

echo "── La decisión y el barrido ─────────────────────────────────────────"
npx tsc -p lib/__tests__/tsconfig.banco.json
node --test lib/__tests__/controles-de-la-reunion.test.mjs

echo
echo "── Los componentes de verdad, en Chromium ───────────────────────────"
ENTRY=".banco-controles-reunion-entry.tsx"
OUT="lib/__tests__/.compilado/harness-controles-reunion.js"
mkdir -p "$(dirname "$OUT")"
trap 'rm -f "$ENTRY"' EXIT

cat > "$ENTRY" <<'TSX'
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
    RecuadrosDeLaSala,
    type LoQueSePinta,
    type ModeracionDeLosRecuadros,
} from "@/components/video/RecuadrosDeLaSala";
import { losMandosDeModeracion } from "@/lib/moderar-en-la-sala";
import { useAvisoDeLaPuerta } from "@/hooks/useAvisoDeLaPuerta";
import { CADA_CUANTO_SUENA_LA_PUERTA_MS } from "@/lib/aviso-de-la-puerta";

(window as any).CADA_CUANTO = CADA_CUANTO_SUENA_LA_PUERTA_MS;

/** Lo que se pidió moderar, para comprobar que el menú llama a quien debe. */
const pedido: Array<{ que: string; id: string }> = [];
(window as any).pedido = pedido;

function persona(id: string, extra: Partial<LoQueSePinta> = {}): LoQueSePinta {
    return {
        id,
        stream: null,
        nombre: id,
        hayVideo: false,
        micEncendido: true,
        compartiendo: false,
        manoLevantada: false,
        ...extra,
    };
}

/**
 * La maqueta reproduce la caja del video CON sus dos barras flotantes, que es
 * lo único que hace que la pregunta «¿se alcanza el menú?» signifique algo:
 * las dos son `absolute z-20` sobre los recuadros. Sus clases se copian de
 * `SalaDeVideo.tsx`.
 */
function Maqueta({
    cuantos,
    distribucion,
    moderas,
    capa = "ninguna",
}: {
    cuantos: number;
    distribucion: "orador" | "cuadricula";
    moderas: boolean;
    /**
     * La capa de la reunión dentro de la plataforma: `fixed z-[99]`, igual que
     * `ReunionEnLaPlataforma`. «portada» pasa su nodo como `container` —lo que
     * hace `SalaDeVideo`—; «suelta» no, que es como estaba.
     */
    capa?: "ninguna" | "portada" | "suelta";
}) {
    const [nodo, setNodo] = useState<HTMLDivElement | null>(null);
    const gente = [
        persona("yo", { propio: true, nombre: "Tú (tú)" }),
        ...["Ana", "Beto", "Caro"].slice(0, cuantos - 1).map((n) => persona(n)),
    ];

    const moderacion: ModeracionDeLosRecuadros | undefined = moderas
        ? {
              mandos: Object.fromEntries(
                  gente
                      .filter((g) => !g.propio)
                      .map((g) => [
                          g.id,
                          losMandosDeModeracion({
                              moderas: true,
                              soyYo: false,
                              micEncendido: g.micEncendido,
                              nombre: g.nombre,
                          }),
                      ]),
              ),
              moderar: (que, id) => pedido.push({ que, id }),
              ocupadoCon: null,
              container: capa === "portada" ? nodo : undefined,
          }
        : undefined;

    const sala = (
        <div className="flex h-screen flex-col bg-zinc-950">
            <div data-caja-del-video className="relative flex min-h-0 flex-1">
                <RecuadrosDeLaSala
                    gente={gente}
                    distribucion={distribucion}
                    enGrande={gente[0].id}
                    moderacion={moderacion}
                />
                {/* La cabecera flotante, tal cual (`SalaDeVideo.tsx`), y con
                    TODOS sus mandos: el contador y los siete botones de 32 px.
                    Con dos botones —como estaba— la caja medía 70 px y ningún
                    «⋯» caía debajo, así que el banco no podía ver que en la
                    vista de orador el del grande tapaba el botón del chat. */}
                <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-start gap-2 bg-gradient-to-b from-black/80 via-black/35 to-transparent px-2 pb-10 pt-2 sm:px-3">
                    <div className="min-w-0 flex-1 truncate rounded px-1 py-1.5 text-sm font-medium text-white">
                        Reunión
                    </div>
                    <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-lg bg-zinc-900/70 p-0.5">
                        <span className="hidden shrink-0 items-center gap-1.5 px-1.5 text-xs text-zinc-300 sm:flex">
                            <span className="h-3.5 w-3.5" />
                            <span className="tabular-nums">3 de 4</span>
                        </span>
                        {["cuadricula", "franja", "chat", "ruido", "copiar", "grabar", "tamano"].map((m) => (
                            <button
                                key={m}
                                data-mando-de-la-cabecera={m}
                                aria-label={m}
                                className="h-8 w-8 shrink-0 rounded-md bg-zinc-800"
                            />
                        ))}
                    </div>
                </div>
                {/* Y la barra de mandos, centrada abajo. */}
                <div
                    data-mandos-de-la-sala
                    className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex justify-center px-2 pb-3 pt-10 sm:pb-4"
                >
                    <div className="pointer-events-auto flex h-11 w-[22rem] items-center rounded-full bg-zinc-900" />
                </div>
            </div>
        </div>
    );
    if (capa === "ninguna") return sala;
    return (
        <div ref={setNodo} data-capa-de-la-reunion style={{ position: "fixed", inset: 0, zIndex: 99 }}>
            {sala}
        </div>
    );
}

let raiz: any = null;
(window as any).pintar = (cuantos: number, distribucion: string, moderas: boolean, capa = "ninguna") => {
    pedido.length = 0;
    raiz ??= createRoot(document.getElementById("app")!);
    raiz.render(
        React.createElement(Maqueta, { cuantos, distribucion: distribucion as any, moderas, capa: capa as any }),
    );
};

// ── El sonido ───────────────────────────────────────────────────────────────

function ElAviso({
    esperando,
    abroLaPuerta,
    silenciado,
    yaDecididos,
}: {
    esperando: Array<{ id: string }>;
    abroLaPuerta: boolean;
    silenciado: boolean;
    yaDecididos: string[];
}) {
    useAvisoDeLaPuerta({ esperando, abroLaPuerta, silenciado, yaDecididos });
    return null;
}

let raizAviso: any = null;
(window as any).avisar = (
    esperando: string[],
    abroLaPuerta: boolean,
    silenciado: boolean,
    yaDecididos: string[],
) => {
    raizAviso ??= createRoot(document.getElementById("aviso")!);
    raizAviso.render(
        React.createElement(ElAviso, {
            esperando: esperando.map((id) => ({ id })),
            abroLaPuerta,
            silenciado,
            yaDecididos,
        }),
    );
};
TSX

npx esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT" \
  --loader:.tsx=tsx --jsx=automatic --log-level=error \
  --define:process.env.NODE_ENV='"production"' \
  --alias:@=. >/dev/null

# Y se exige que la mitad de navegador se haya EJERCIDO de verdad.
#
# Sin esto, un banco que se salta entero —sin Chromium, o sin el CSS del build
# porque alguien lo estaba regenerando— sale «0 fallos» y se lee como verde.
# Pasó mientras se escribía esto: 17 pruebas saltadas y ni una ejecutada. Un
# banco que no arranca se parece muchísimo a un banco que pasa.
SALIDA=$(node --test lib/__tests__/controles-de-la-reunion-navegador.test.mjs 2>&1) || {
  echo "$SALIDA"
  exit 1
}
echo "$SALIDA"
EJERCIDAS=$(echo "$SALIDA" | sed -n 's/^# pass \([0-9]*\)$/\1/p' | tail -1)
if [ "${EJERCIDAS:-0}" -eq 0 ]; then
  echo
  echo "MAL: la mitad de navegador no ejerció NI UNA prueba (se saltaron todas)."
  echo "     Falta Chromium, o el CSS del build: corre 'npm run build'."
  exit 1
fi
