#!/usr/bin/env bash
# El banco de PROPUESTAS COMERCIALES (Panel › Propuestas y /propuesta/<token>).
#
# Incluye los ajustes de la segunda vuelta: el azul claro, el encabezado (logo,
# «Propuesta comercial» debajo y el eslogan de la cuenta a la derecha),
# Servicios/Productos, los campos nuevos (empresa, WhatsApp, línea, correo,
# vigencia, nota interna/pública, método y medio de pago) y el envío por
# WhatsApp desde la línea de la propuesta.
#
# Tres mitades: la REGLA pura y un barrido (ruta pública, noindex en metadata y
# cabecera, copiar/editar en el panel); las ACCIONES contra Postgres (token de
# 32 caracteres que no cambia al editar, otra cuenta no ve ni toca, un agente
# no crea, la página pública solo lleva lo elegido y cuenta la visita); y la
# PÁGINA PÚBLICA en Chromium, con el componente real sobre el CSS del build, a
# 320/360/390/768/1440: nada se sale a lo ancho y se llega al final con la
# rueda.
#
# `MODO=roto` lee el código de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y afirma que no existía nada de esto.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-73f991f}"
export ANTES_REF

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/propuestas.test.mjs "$@"
  exit $?
fi

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

OUT=lib/__tests__/.compilado/propuestas
mkdir -p "$OUT"

# 1. La regla pura.
npx esbuild lib/propuestas.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --log-level=error

# 2. Las acciones contra Postgres.
PGDIR=/tmp/pgpropuestas
PORT=55541
if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=https://s3.test S3_BUCKET_NAME=verzay-media \
       NEXT_PUBLIC_APP_URL=https://app.test GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

npx esbuild lib/__tests__/fingido/entrada-de-propuestas.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only --external:next/headers \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:@/actions/whatsapp-dispatcher=./lib/__tests__/fingido/despacho-de-propuestas.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-propuestas.js"

# 3. La página pública, con el componente REAL.
ENTRY=".banco-propuestas-entry.tsx"
HARNESS="lib/__tests__/.compilado/harness-propuestas.js"
trap 'rm -f "$ENTRY"' EXIT
cat > "$ENTRY" <<'TSX'
import React from "react";
import { createRoot } from "react-dom/client";
import { PropuestaPublica } from "@/components/propuestas/PropuestaPublica";
import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";

const propuesta = {
    token: "t".repeat(32),
    cliente: "ClinicaDentalSonrisaDeLaCiudadDeMedellinSinEspacios",
    empresa: "Grupo Clínicas Sonrisa de Antioquia SAS",
    fecha: "2026-09-28",
    vigencia: "2026-10-15",
    tipoDeItems: "productos",
    nota: "Precios con el descuento de lanzamiento.",
    metodoPago: "Transferencia / Nequi",
    medioPago: "Bancolombia ahorros 123-456789-00\nA nombre de Verzay SAS",
    moneda: "COP",
    servicios: [
        { nombre: "Agente de IA para WhatsApp con entrenamiento y flujos", alcance: "Configuración de la línea\nEntrenamiento con el catálogo\nDos flujos de venta", inversion: 1500000 },
        { nombre: "Landing", alcance: "Una página con formulario", inversion: 800000 },
        { nombre: "CRM", alcance: "", inversion: 1100000 },
    ],
    mantenimientoMensual: 250000,
    mantenimientoDescripcion: "Soporte, ajustes del agente y reportes mensuales.",
    condiciones: "50% de anticipo y 50% a la entrega.\nVigencia de la propuesta: 15 días.\n" + "Texto largo ".repeat(40),
    actualizadaEn: new Date().toISOString(),
    negocio: { nombre: "Verzay | Pruebas", logo: null, eslogan: "Automatiza tu negocio con IA y vende más cada día" },
};

createRoot(document.getElementById("app")!).render(
    <main className={`bg-slate-50 ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
        <PropuestaPublica propuesta={propuesta as any} />
    </main>,
);
(window as any).listo = true;
TSX
npx esbuild "$ENTRY" --bundle --format=iife --outfile="$HARNESS" \
  --jsx=automatic --define:process.env.NODE_ENV=\"production\" --log-level=error

node --test lib/__tests__/propuestas.test.mjs "$@"
