#!/usr/bin/env bash
# La CABECERA de la página pública de una propuesta va DENTRO de la tarjeta
# azul: el logo arriba a la derecha y el eslogan de la cuenta abajo a la
# derecha, en negrilla y con letra que crece con la pantalla (16/18/20 px).
# Nada de «Propuesta comercial» en ninguna parte, y nada de cabecera aparte.
#
# Antes (ANTES_REF) había una cabecera encima de la tarjeta, con el rótulo
# debajo del logo y el eslogan a 14 px. Monta el componente REAL sobre el CSS
# del build en Chromium, con logo de iniciales y con imagen, eslogan corto,
# largo y vacío, a 390/768/1024/1440. `MODO=roto` monta el de ANTES_REF
# (pinchado a un commit, nunca `origin/main`) y afirma el rótulo y los 14 px.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-153f64f}"

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
# La propuesta lleva dentro las piezas de la página del plan (y su guía), que
# traen módulos del servidor: se cambian por los fingidos de siempre.
F=lib/__tests__/fingido
npx esbuild "$ENTRY" --bundle --format=iife --outfile=lib/__tests__/.compilado/harness-cabecera-propuesta.js \
  --jsx=automatic --define:process.env.NODE_ENV=\"production\" --define:process.env='{}' \
  --alias:next/link=./$F/next-link-ssr.tsx \
  --alias:next/navigation=./$F/guia-tema/next-navigation.ts \
  --alias:@/lib/introduccion-publica.server=./$F/guia-tema/introduccion-publica.ts \
  --alias:@/lib/contacto-de-la-guia.server=./$F/guia-tema/contacto-de-la-guia.ts \
  --alias:@/actions/guia-publica-actions=./$F/guia-tema/guia-publica-actions.ts \
  --log-level=error

node --test lib/__tests__/cabecera-de-la-propuesta.test.mjs "$@"
