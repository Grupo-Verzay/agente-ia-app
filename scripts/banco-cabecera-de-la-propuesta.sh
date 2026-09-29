#!/usr/bin/env bash
# La CABECERA de la página pública de una propuesta: el bloque del logo con
# «Propuesta comercial» debajo y el eslogan de la cuenta tienen que quedar a la
# MISMA altura (centros alineados), y el eslogan en negrilla.
#
# Antes la cabecera iba `items-start` y el eslogan con `pt-1`: quedaba pegado
# arriba, a la altura del logo, descolgado del rótulo. Monta el componente REAL
# sobre el CSS del build en Chromium, con logo de iniciales y con imagen, eslogan
# corto y largo, a 390/768/1024/1440. `MODO=roto` monta el de ANTES_REF
# (pinchado a un commit, nunca `origin/main`) y afirma el desfase.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-7e7d399}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

COMPONENTE="@/components/propuestas/PropuestaPublica"
ANTES_DIR="components/propuestas/.antes-banco-cabecera"
ENTRY=".banco-cabecera-propuesta-entry.tsx"
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

const q = new URLSearchParams(location.search);
const logo = q.get("logo") === "si"
  ? "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#123"/></svg>')
  : null;
const propuesta = {
    token: "t".repeat(32), cliente: "Clínica Dental Sonrisa", empresa: "",
    fecha: "2026-09-28", vigencia: null, tipoDeItems: "servicios",
    nota: "", metodoPago: "", medioPago: "", moneda: "COP",
    servicios: [{ nombre: "Agente de IA", alcance: "Configurar la línea", inversion: 1500000 }],
    mantenimientoMensual: null, mantenimientoDescripcion: "",
    condiciones: "", actualizadaEn: new Date().toISOString(),
    negocio: { nombre: "Verzay", logo, eslogan: q.get("eslogan") || "" },
};
createRoot(document.getElementById("app")!).render(
    <main className={\`bg-slate-50 \${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}\`}>
        <PropuestaPublica propuesta={propuesta as any} />
    </main>,
);
(window as any).listo = true;
TSX
npx esbuild "$ENTRY" --bundle --format=iife --outfile=lib/__tests__/.compilado/harness-cabecera-propuesta.js \
  --jsx=automatic --define:process.env.NODE_ENV=\"production\" --log-level=error

node --test lib/__tests__/cabecera-de-la-propuesta.test.mjs "$@"
