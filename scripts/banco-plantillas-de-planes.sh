#!/usr/bin/env bash
# El banco de las PLANTILLAS DE PLANES de Propuestas comerciales.
#
# Tres mitades: la REGLA pura (qué se acepta al guardar, cómo se carga una
# plantilla en la propuesta: COPIA, nunca enlace) y un barrido; las ACCIONES
# contra Postgres (sin tope de cuántas, editar y borrar, otra cuenta ni un
# agente tocan nada, y la propuesta hecha con una plantilla no cambia cuando la
# plantilla cambia ni al revés); y la PANTALLA real en Chromium sobre el CSS del
# build (la sección de plantillas, crear una, cargarla en una propuesta y
# editarla allí sin que la plantilla se mueva), a 1440/1024/390.
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
ANTES_REF="${ANTES_REF:-f8057cb}"
export ANTES_REF

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/plantillas-de-planes.test.mjs "$@"
  exit $?
fi

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

OUT=lib/__tests__/.compilado/plantillas
mkdir -p "$OUT"

# 1. La regla pura.
npx esbuild lib/plantillas-de-planes.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --log-level=error

# 2. Las acciones contra Postgres.
PGDIR=/tmp/pgplantillas
PORT=55542
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

npx esbuild lib/__tests__/fingido/entrada-de-plantillas-de-planes.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only --external:next/headers \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:@/actions/whatsapp-dispatcher=./lib/__tests__/fingido/despacho-de-propuestas.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-plantillas-de-planes.js"

# 3. La pantalla, con los componentes REALES y las acciones mudas.
ENTRY=".banco-plantillas-entry.tsx"
HARNESS="lib/__tests__/.compilado/harness-plantillas.js"
trap 'rm -f "$ENTRY"' EXIT
cat > "$ENTRY" <<'TSX'
import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { PropuestasClient } from "@/app/(root)/(protected)/panel/propuestas/_components/PropuestasClient";
import { pedidas } from "@/actions/propuestas-actions";

const hoy = new Date().toISOString();
const nombres = [["Enterprise", 2500000], ["Lite", 99000], ["Básico", 150000], ["Starter", 250000], ["Esencial", 400000], ["Business", 800000], ["Pro Plus", 1200000]] as const;
const plantillas = nombres.map(([nombre, precio], i) => ({
    id: `pl-${i}`,
    nombre,
    precio,
    moneda: "COP",
    caracteristicas: [`${nombre}: 1 línea de WhatsApp`, "Agente de IA entrenado", "CRM y embudos"],
    creadaEn: hoy,
    actualizadaEn: hoy,
}));
(window as any).plantillasDeInicio = JSON.parse(JSON.stringify(plantillas));
(window as any).plantillasVivas = plantillas;
(window as any).pedidas = pedidas;

createRoot(document.getElementById("app")!).render(
    <div className="app-module-content h-screen p-4">
        <PropuestasClient inicial={[]} origen="https://app.test" lineas={[]} esloganInicial="" plantillasIniciales={plantillas as any} />
        <Toaster />
    </div>,
);
(window as any).listo = true;
TSX
npx esbuild "$ENTRY" --bundle --format=iife --outfile="$HARNESS" \
  --jsx=automatic --define:process.env.NODE_ENV=\"production\" --define:process.env='{}' \
  --alias:@/actions/propuestas-actions=./lib/__tests__/fingido/acciones-de-propuestas-mudas.ts \
  --log-level=error

node --test lib/__tests__/plantillas-de-planes.test.mjs "$@"
