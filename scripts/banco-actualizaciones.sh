#!/usr/bin/env bash
# El banco de ACTUALIZACIONES (Documentación › Actualizaciones).
#
# Tres mitades: la REGLA pura y un barrido del código; las ACCIONES contra
# Postgres (publicar es de la casa, a cada persona le sale UNA vez, retirar la
# quita, y el SQL dice lo mismo que la regla); y en CHROMIUM, sobre el CSS del
# build, las cuatro tarjetas de Documentación —orden y simetría— y la ventana
# que salta.
#
# `MODO=roto` pinta la página de Documentación de ANTES_REF —pinchado a un
# commit, nunca `origin/main`— y afirma el fallo: «Plantillas IA» dentro, sin
# «Actualizaciones», y ninguna ventana en el layout.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-97ae916}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

OUT=lib/__tests__/.compilado/actualizaciones
mkdir -p "$OUT"

# 1. La regla pura.
npx esbuild lib/actualizaciones.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --log-level=error

# 2. Las acciones contra Postgres.
PGDIR=/tmp/pgactualizaciones
PORT=55512
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
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost S3_BUCKET_NAME=verzay-media \
       GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

npx esbuild lib/__tests__/fingido/entrada-de-actualizaciones.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-actualizaciones.js"

# 3. La pantalla y la ventana, con los componentes REALES.
ENTRY=".banco-actualizaciones-entry.tsx"
HARNESS="lib/__tests__/.compilado/harness-actualizaciones.js"
PAGINA_ANTES="app/(root)/documentation/.page-antes.tsx"
MAIN_ANTES="app/(root)/documentation/_components/.MainDocumentation-antes.tsx"
trap 'rm -f "$ENTRY" "$PAGINA_ANTES" "$MAIN_ANTES"' EXIT

PAGINA="@/app/(root)/documentation/page"
AVISO='import { AvisoDeActualizacion } from "@/components/actualizaciones/AvisoDeActualizacion";'
AVISO_JSX='<AvisoDeActualizacion />'
if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:app/(root)/documentation/_components/MainDocumentation.tsx" > "$MAIN_ANTES"
  git show "$ANTES_REF:app/(root)/documentation/page.tsx" \
    | sed 's#from "./_components"#from "./_components/.MainDocumentation-antes"#' > "$PAGINA_ANTES"
  PAGINA="@/app/(root)/documentation/.page-antes"
  # El «antes» no tiene ventana ninguna.
  AVISO='const AvisoDeActualizacion = () => null;'
fi

cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import DocumentationPage from "$PAGINA";
$AVISO

const w = window as any;
const raiz = () => (w.__raiz ??= createRoot(document.getElementById("app")!));
w.documentacion = async () => {
    const el = await (DocumentationPage as any)({ searchParams: {} });
    raiz().render(el);
};
w.aviso = (conPendiente: boolean) => {
    w.__pendiente = conPendiente
        ? {
              id: "act-" + Math.random().toString(36).slice(2),
              texto: "Ya puedes exportar a PDF tus conversaciones.\nMira la guía para ver cómo.",
              archivo: { url: "http://localhost/verzay-media/c/actualizaciones/guia.pdf", nombre: "guia.pdf", mime: "application/pdf", tamano: 20480 },
              publicadaEn: new Date().toISOString(),
              publicadaPor: "Carlos",
          }
        : null;
    // Remontar es «volver a abrir la plataforma».
    w.__raiz?.unmount?.();
    w.__raiz = null;
    raiz().render($AVISO_JSX);
};
w.listo = true;
TSX

node scripts/empaquetar-con-acciones-mudas.mjs "$ENTRY" "$HARNESS" \
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-mudo.ts \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:@/actions/actualizaciones-actions=./lib/__tests__/fingido/acciones-de-actualizaciones.ts

rm -f "$ENTRY" "$PAGINA_ANTES" "$MAIN_ANTES"

node --test lib/__tests__/actualizaciones.test.mjs "$@"
