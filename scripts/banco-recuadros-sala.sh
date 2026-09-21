#!/usr/bin/env bash
# El banco del REPARTO de la sala, en un navegador de verdad.
#
# Prueba lo que costó una vuelta entera de «se apaga la cámara y ya no se
# escucha a nadie»: en la vista de orador, quién va en grande cambia cada pocos
# segundos (lo decide `elQueHabla`), y la persona que se mueve de grande a la
# tira se REMONTA. Si su audio viajara en ese `<video>`, el remonte le suelta el
# `srcObject` y se queda muda. Ahora el audio va en un `<audio>` estable del pool
# que NO entra en el reparto, así que sobrevive al remonte.
#
# El banco monta el componente REAL y comprueba, en dos modos:
#   - BUENO (el componente con el pool): el `<audio>` de una persona es el MISMO
#     nodo del DOM tras cambiar de orador y apagar la cámara, con su `srcObject`
#     puesto y sonando.
#   - ROTO (la estructura vieja, con el audio en el `<video>` del reparto): el
#     `<video>` de esa persona CAMBIA de nodo al cambiar de orador —o sea, se
#     remonta—, que es la causa del corte.
#
# Empaqueta el componente real + un arnés con esbuild, desde la raíz para que
# resuelva `react`, en `.compilado/` (que está en .gitignore).
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

ENTRY=".banco-recuadros-sala-entry.tsx"
OUT="lib/__tests__/.compilado/harness-recuadros-sala.js"
mkdir -p "$(dirname "$OUT")"
trap 'rm -f "$ENTRY"' EXIT

cat > "$ENTRY" <<'TSX'
import React, { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RecuadrosDeLaSala, type LoQueSePinta } from "@/components/video/RecuadrosDeLaSala";

type Estado = { gente: LoQueSePinta[]; enGrande: string | null };

// ── BUENO: el componente REAL, con su pool de audio ────────────────────────
let raizBuena: Root | null = null;
(window as any).pintarBueno = (estado: Estado) => {
    raizBuena ??= createRoot(document.getElementById("bueno")!);
    raizBuena.render(
        React.createElement(RecuadrosDeLaSala, {
            gente: estado.gente,
            distribucion: "orador",
            enGrande: estado.enGrande,
            tiraPlegada: false,
        }),
    );
};

// ── ROTO: la estructura vieja, con el AUDIO en el `<video>` del reparto ─────
// Reproduce a mano lo que hacía el componente antes del pool: el grande es un
// nodo distinto de las miniaturas, así que mover a alguien de uno a otro lo
// remonta. El `<video>` NO va `muted`, o sea que el audio viajaba en él.
function VideoRoto({ id, stream }: { id: string; stream: MediaStream | null }) {
    const ref = useRef<HTMLVideoElement | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (el && el.srcObject !== stream) el.srcObject = stream;
    }, [stream]);
    return React.createElement("video", { ref, "data-video-roto": id, autoPlay: true, playsInline: true });
}
function Roto({ gente, enGrande }: Estado) {
    const grande = gente.find((g) => g.id === enGrande) ?? gente[0];
    const resto = gente.filter((g) => g.id !== grande.id);
    return React.createElement(
        "div",
        null,
        React.createElement("div", { className: "grande" }, React.createElement(VideoRoto, { id: grande.id, stream: grande.stream })),
        React.createElement(
            "div",
            null,
            resto.map((g) => React.createElement("div", { key: g.id }, React.createElement(VideoRoto, { id: g.id, stream: g.stream }))),
        ),
    );
}
let raizRota: Root | null = null;
(window as any).pintarRoto = (estado: Estado) => {
    raizRota ??= createRoot(document.getElementById("roto")!);
    raizRota.render(React.createElement(Roto, estado));
};

(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT" \
    --alias:@="$(pwd)" --loader:.tsx=tsx --jsx=automatic \
    --define:process.env.NODE_ENV='"production"' --log-level=error

rm -f "$ENTRY"

node --test lib/__tests__/recuadros-de-la-sala.test.mjs "$@"
