#!/usr/bin/env bash
# Entrenamiento › Cotizaciones (lado de la App: la regla, el PDF, la ruta que
# llama el backend y los ajustes).
#
# Dos mitades:
#   1. La REGLA y el PDF, en Node y sin base: el precio sale del catálogo, lo
#      que no está o pide un descuento escala, lo ambiguo se pregunta, y el PDF
#      lleva logo, negocio, líneas, total y condiciones (leído con pdf.js).
#   2. La RUTA y las ACCIONES contra Postgres: apagada de serie, la clave
#      interna, el PDF con el catálogo de ESA cuenta subido y apuntado en
#      Cotizaciones, y los ajustes que solo guarda quien alcanza la cuenta.
#
# `MODO=roto` lee ANTES_REF —PINCHADO a un commit, nunca `origin/main`, que en
# cuanto esto se fusione sería el «ahora»— y AFIRMA que nada existía.
#
# Quien ENVÍA el PDF por WhatsApp y ESCALA es el backend: su banco es
# `api-webhook/scripts/banco-cotizacion-ia.sh`.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:/usr/lib/postgresql/16/bin:$PATH"
MODO="${MODO:-bueno}"
export MODO
# 8b1bdab — antes de esto: no había pestaña, ni regla, ni ruta de cotizaciones de la IA.
export ANTES_REF="${ANTES_REF:-8b1bdab}"

# ── 1. Regla y PDF ──────────────────────────────────────────────────────
COMP=lib/__tests__/.compilado/cotizacion-ia
mkdir -p "$COMP"
if [ "$MODO" != "roto" ]; then
  npx esbuild lib/cotizacion-ia.ts lib/cotizacion-en-pdf.ts --bundle --platform=node --format=esm \
    --outdir="$COMP" --log-level=error
fi
node --test lib/__tests__/cotizacion-ia.test.mjs

[ "$MODO" = "roto" ] && exit 0

# ── 2. La pestaña, pintada en Chromium ─────────────────────────────────
# La cabecera de la pestaña vecina se LEE de su archivo, no se copia aquí: si
# alguien la cambia, la comparación sigue a la de verdad.
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
VECINA=$(grep -o '<CardHeader className="[^"]*"' "app/(root)/ai/_components/KeywordsBuilder.tsx" | head -1 | sed 's/.*className="\([^"]*\)"/\1/')
[ -n "$VECINA" ] || { echo "no se pudo leer la cabecera de KeywordsBuilder"; exit 1; }
NAV=lib/__tests__/.compilado/cotizacion-ia-nav
mkdir -p "$NAV"
npx esbuild lib/__tests__/cotizacion-ia/harness.tsx --bundle --format=esm --outfile="$NAV/harness.js" \
  --alias:@="$(pwd)" \
  --alias:@/actions/cotizacion-ia-actions=./lib/__tests__/fingido/acciones-de-cotizacion-grabadas.ts \
  --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts \
  --define:CLASE_DE_LA_CABECERA_VECINA="\"$VECINA\"" \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error
npx tailwindcss -i app/globals.css -o "$NAV/css.css" >/dev/null 2>&1
CSS_DEL_BANCO="$NAV/css.css" node --test --test-concurrency=1 lib/__tests__/cotizacion-ia-navegador.test.mjs

# ── 3. Ruta y acciones contra Postgres ──────────────────────────────────
PGDIR=/tmp/pgcotizacionia
PORT=55561
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
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

OUT=lib/__tests__/.compilado/cotizacion-ia-db
mkdir -p "$OUT"
npx esbuild lib/__tests__/fingido/entrada-de-cotizacion-ia.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only --external:sharp \
  --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-llamadas.ts \
  --alias:@/lib/minio=./lib/__tests__/fingido/minio-de-cotizacion.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:next/server=./lib/__tests__/fingido/next-server.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-cotizacion-ia.js"

node --test --test-concurrency=1 lib/__tests__/cotizacion-ia-db.test.mjs "$@"
