#!/usr/bin/env bash
# El banco del fondo de la sala de reunión (#824), en un navegador de verdad.
#
# Prueba lo que no se puede en memoria: que contra los ficheros vendorizados
# reales el modelo carga y segmenta, y que `useMediosDeLlamada.cambiarElFondo`
# mete la pista del canvas en el sender de video de una `RTCPeerConnection`
# —el track del sender CAMBIA al activar el desenfoque, que es el encargo—.
#
# Empaqueta el HOOK REAL más un arnés con esbuild, desde la raíz para que
# resuelva `react`, en `.compilado/` (que está en .gitignore). El arnés se
# escribe en la raíz solo el instante que dura el bundle y se borra enseguida:
# `tsconfig` incluye `**/*.tsx`, así que dejarlo tumbaría a `tsc`.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
# Playwright va instalado en el sistema, no en el proyecto.
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

# El mismo modelo que produce el build.
node scripts/vendorizar-segmentacion.mjs

ENTRY=".banco-fondo-entry.tsx"
OUT="lib/__tests__/.compilado/harness-fondo.js"
mkdir -p "$(dirname "$OUT")"
trap 'rm -f "$ENTRY"' EXIT

cat > "$ENTRY" <<'TSX'
import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useMediosDeLlamada } from "@/hooks/useMediosDeLlamada";

function App() {
    const medios = useMediosDeLlamada({ alFallar: (m) => ((window as any).__fallo = m) });
    const ref = useRef(medios);
    ref.current = medios;
    useEffect(() => {
        (window as any).__api = {
            arrancar: (v: boolean) => ref.current.arrancar(v),
            cambiarElFondo: (m: any, f?: any) => ref.current.cambiarElFondo(m, f),
            prepararLaConexion: (pc: RTCPeerConnection) => ref.current.prepararLaConexion(pc),
            estado: () => ({
                fondo: ref.current.fondo,
                fondoId: ref.current.fondoId,
                localVideoTrackId: ref.current.local?.getVideoTracks()[0]?.id ?? null,
            }),
        };
        (window as any).__listo = true;
    }, []);
    return React.createElement("div", null, "harness");
}

createRoot(document.getElementById("app")!).render(React.createElement(App));
TSX

npx esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT" \
    --alias:@="$(pwd)" --loader:.tsx=tsx --jsx=automatic \
    --define:process.env.NODE_ENV='"production"' --log-level=error

rm -f "$ENTRY"

node --test lib/__tests__/fondos-vendorizados.test.mjs lib/__tests__/fondo-cambia-el-sender.test.mjs "$@"
