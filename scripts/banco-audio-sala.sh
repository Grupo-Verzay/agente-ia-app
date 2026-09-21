#!/usr/bin/env bash
# El banco del AUDIO de la sala de reunión, en un navegador de verdad.
#
# Prueba lo que no se puede en memoria ni con un solo peer: dos instancias del
# HOOK REAL (`useMediosDeLlamada`), una malla de dos entre ellas, y que el audio
# fluye en LAS DOS DIRECCIONES en cada caso del encargo —entrar solo con audio,
# apagar y prender la cámara, compartir pantalla, y activar/desactivar la
# supresión de ruido—. Y la red de seguridad: una conexión que llega a
# `connected` con la pista de audio suelta se sana sola al conectar (el fallo que
# se veía como «no me oyen hasta que prendo la cámara»).
#
# Empaqueta el hook real + un arnés con esbuild, desde la raíz para que resuelva
# `react`, en `.compilado/` (que está en .gitignore). El arnés se escribe en la
# raíz solo el instante que dura el bundle: `tsconfig` incluye `**/*.tsx`, así
# que dejarlo tumbaría a `tsc`.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

ENTRY=".banco-audio-sala-entry.tsx"
OUT="lib/__tests__/.compilado/harness-audio-sala.js"
mkdir -p "$(dirname "$OUT")"
trap 'rm -f "$ENTRY"' EXIT

cat > "$ENTRY" <<'TSX'
import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useMediosDeLlamada } from "@/hooks/useMediosDeLlamada";

// Dos instancias del hook real, una por persona, cada una en su propia raíz.
function exponer(nombre: string) {
    function App() {
        const medios = useMediosDeLlamada({ alFallar: (m) => ((window as any)[nombre + "_fallo"] = m) });
        const ref = useRef(medios);
        ref.current = medios;
        useEffect(() => {
            (window as any)[nombre] = {
                arrancar: (v: boolean) => ref.current.arrancar(v),
                alternarCamara: () => ref.current.alternarCamara(),
                alternarPantalla: () => ref.current.alternarPantalla(),
                cambiarSupresion: (v: boolean) => ref.current.cambiarSupresion(v),
                prepararLaConexion: (pc: RTCPeerConnection) => ref.current.prepararLaConexion(pc),
                engancharALaConexion: (pc: RTCPeerConnection) => ref.current.engancharALaConexion(pc),
                estado: () => ({
                    micEncendido: ref.current.micEncendido,
                    camaraEncendida: ref.current.camaraEncendida,
                    compartiendo: ref.current.compartiendo,
                    supresionDeRuido: ref.current.supresionDeRuido,
                }),
            };
            (window as any)[nombre + "_listo"] = true;
        }, []);
        return React.createElement("div", null, nombre);
    }
    createRoot(document.getElementById(nombre)!).render(React.createElement(App));
}

exponer("A");
exponer("B");
TSX

npx esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT" \
    --alias:@="$(pwd)" --loader:.tsx=tsx --jsx=automatic \
    --define:process.env.NODE_ENV='"production"' --log-level=error

rm -f "$ENTRY"

node --test lib/__tests__/audio-de-la-sala.test.mjs "$@"
