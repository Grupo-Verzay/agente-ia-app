#!/usr/bin/env bash
# El banco del CONTENIDO de una actualización: enlaces en el texto y el video
# que se REPRODUCE dentro de la tarjeta, nunca se descarga.
#
# Dos mitades: la REGLA pura (de qué clase es un archivo con mime genérico, y
# con qué tipo se guarda en el bucket un WebM con nombre `.mp4`); y en
# CHROMIUM, sobre el CSS del build, la tarjeta de la lista y la ventana que
# salta, con el MISMO video que se subió en producción («Leads.mp4», que por
# dentro es un WebM) servido igual que lo sirve el bucket.
#
# `MODO=roto` monta el componente y las reglas de ANTES_REF —pinchado a un
# commit, nunca `origin/main`— y AFIRMA el fallo: la dirección es texto plano, y
# un video subido con tipo genérico sale como documento y al pulsarlo se
# DESCARGA.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-0a3f714}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

OUT=lib/__tests__/.compilado/contenido-de-actualizacion
mkdir -p "$OUT"

LIB_ANTES="lib/.actualizaciones-antes.ts"
ADJ_ANTES="lib/.adjuntos-del-equipo-antes.ts"
CONT_ANTES="components/actualizaciones/.ContenidoDeLaActualizacion-antes.tsx"
AVISO_ANTES="components/actualizaciones/.AvisoDeActualizacion-antes.tsx"
ENTRY=".banco-contenido-de-actualizacion-entry.tsx"
trap 'rm -f "$ENTRY" "$LIB_ANTES" "$ADJ_ANTES" "$CONT_ANTES" "$AVISO_ANTES"' EXIT

ALIAS=()
CONTENIDO="@/components/actualizaciones/ContenidoDeLaActualizacion"
AVISO="@/components/actualizaciones/AvisoDeActualizacion"
if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:lib/actualizaciones.ts" > "$LIB_ANTES"
  git show "$ANTES_REF:lib/adjuntos-del-equipo.ts" > "$ADJ_ANTES"
  git show "$ANTES_REF:components/actualizaciones/ContenidoDeLaActualizacion.tsx" > "$CONT_ANTES"
  git show "$ANTES_REF:components/actualizaciones/AvisoDeActualizacion.tsx" \
    | sed "s#from './ContenidoDeLaActualizacion'#from './.ContenidoDeLaActualizacion-antes'#" > "$AVISO_ANTES"
  CONTENIDO="@/components/actualizaciones/.ContenidoDeLaActualizacion-antes"
  AVISO="@/components/actualizaciones/.AvisoDeActualizacion-antes"
  ALIAS=(--alias:@/lib/actualizaciones=./$LIB_ANTES --alias:@/lib/adjuntos-del-equipo=./$ADJ_ANTES)
  # La regla de antes, para afirmar su fallo.
  npx esbuild "$ADJ_ANTES" --bundle --platform=node --format=esm --outfile="$OUT/adjuntos.js" --log-level=error
else
  npx esbuild lib/adjuntos-del-equipo.ts --bundle --platform=node --format=esm --outfile="$OUT/adjuntos.js" --log-level=error
fi

cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { ContenidoDeLaActualizacion } from "$CONTENIDO";
import { AvisoDeActualizacion } from "$AVISO";

const w = window as any;
let raiz: any = null;
const montar = (el: React.ReactElement) => {
    raiz?.unmount?.();
    raiz = createRoot(document.getElementById("app")!);
    raiz.render(el);
};
// La tarjeta de la lista de Documentación › Actualizaciones, con su marco.
w.tarjeta = (a: any, completa = false) =>
    montar(
        <div className="p-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4" data-tarjeta>
                <ContenidoDeLaActualizacion actualizacion={a} completa={completa} />
            </div>
        </div>,
    );
// La ventana que salta a toda la plataforma.
w.ventana = (a: any) => {
    w.__pendiente = a;
    w.__marcas = [];
    montar(<AvisoDeActualizacion />);
};
w.listo = true;
TSX

node scripts/empaquetar-con-acciones-mudas.mjs "$ENTRY" "lib/__tests__/.compilado/harness-contenido-de-actualizacion.js" \
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-mudo.ts \
  --alias:@/actions/actualizaciones-actions=./lib/__tests__/fingido/acciones-de-actualizaciones.ts \
  "${ALIAS[@]}"

rm -f "$ENTRY" "$LIB_ANTES" "$ADJ_ANTES" "$CONT_ANTES" "$AVISO_ANTES"

node --test lib/__tests__/contenido-de-actualizacion.test.mjs "$@"
