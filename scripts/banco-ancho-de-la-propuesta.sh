#!/usr/bin/env bash
# El ANCHO de la página pública de una propuesta (/propuesta/<token>).
#
# En escritorio el contenido era una tira de 672 px (`max-w-2xl`) en el centro
# de la pantalla. Ahora crece por escalones (lg 896, xl 1024, 2xl 1152) sin
# llegar nunca al ancho entero, los párrafos largos se topan en `max-w-3xl`
# para que se lean cómodos, y en tableta y móvil queda exactamente igual.
#
# Monta el componente REAL sobre el CSS del build en Chromium y mide a
# 390/768/1024/1280/1440/1920. `MODO=roto` monta el componente de ANTES_REF
# (pinchado a un commit, nunca `origin/main`) y afirma la tira de 672 px.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-f8057cb}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

COMPONENTE="@/components/propuestas/PropuestaPublica"
ANTES_DIR="components/propuestas/.antes-banco"
ENTRY=".banco-ancho-propuesta-entry.tsx"
trap 'rm -rf "$ENTRY" "$ANTES_DIR"' EXIT
if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_DIR"
  git show "$ANTES_REF:components/propuestas/PropuestaPublica.tsx" > "$ANTES_DIR/PropuestaPublica.tsx"
  COMPONENTE="@/$ANTES_DIR/PropuestaPublica"
fi

mkdir -p lib/__tests__/.compilado
cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { PropuestaPublica } from "$COMPONENTE";
import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";

const largo = "El alcance incluye configurar la línea, entrenar al agente con el catálogo completo y dejar listos los flujos de venta. ";
const propuesta = {
    token: "t".repeat(32), cliente: "Clínica Dental Sonrisa", empresa: "Grupo Sonrisa SAS",
    fecha: "2026-09-28", vigencia: "2026-10-15", tipoDeItems: "servicios",
    nota: largo.repeat(3), metodoPago: "Transferencia", medioPago: largo.repeat(2), moneda: "COP",
    servicios: [
        { nombre: "Agente de IA para WhatsApp", alcance: largo.repeat(4), inversion: 1500000 },
        { nombre: "Landing", alcance: "Una página con formulario", inversion: 800000 },
    ],
    mantenimientoMensual: 250000, mantenimientoDescripcion: largo.repeat(2),
    condiciones: largo.repeat(5), actualizadaEn: new Date().toISOString(),
    negocio: { nombre: "Verzay", logo: null, eslogan: "Automatiza tu negocio con IA" },
};
createRoot(document.getElementById("app")!).render(
    <main className={\`bg-slate-50 \${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}\`}>
        <PropuestaPublica propuesta={propuesta as any} />
    </main>,
);
(window as any).listo = true;
TSX
npx esbuild "$ENTRY" --bundle --format=iife --outfile=lib/__tests__/.compilado/harness-ancho-propuesta.js \
  --jsx=automatic --define:process.env.NODE_ENV=\"production\" --log-level=error

node --test lib/__tests__/ancho-de-la-propuesta.test.mjs "$@"
