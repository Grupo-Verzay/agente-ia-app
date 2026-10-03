#!/usr/bin/env bash
# El banco de la PÁGINA DE DETALLE de un plan (`/planes/<plan>`).
#
# Tres mitades: la REGLA pura (cómo se arman las funciones, la capacidad, el
# video, los botones y qué texto guardado ya no cuadra con el plan) y un barrido
# del código; las ACCIONES contra Postgres (el panel de Planes guarda, y la
# página lo refleja EN VIVO: apagar, renombrar, describir, cambiar créditos o
# apagar el plan); y la PANTALLA real en Chromium sobre el CSS del build, en el
# orden pedido —hero con su video, capacidad, funciones por categoría con su
# tutorial y preguntas— y sin testimonios ni bloques genéricos.
#
# `MODO=roto` corre las mismas pruebas contra ANTES_REF —pinchado a un commit,
# nunca `origin/main`— y AFIRMA los fallos: la página copiaba `features` tal
# cual (con su texto viejo), enseñaba un plan apagado, pintaba testimonios y el
# guardado parcial del detalle borraba los testimonios y las preguntas.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-88ade1f}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

RAIZ="$PWD"
OUT=lib/__tests__/.compilado/pagina-de-plan
mkdir -p "$OUT"

# ── Postgres de usar y tirar ─────────────────────────────────────────────────
PGDIR=/tmp/pgpaginadeplan
PORT=55547
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

ALIAS_NODO=(
  --external:@prisma/client --external:server-only --external:next/headers
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts
  --alias:react=./lib/__tests__/fingido/react-cache.ts
  --log-level=error
)

if [ "$MODO" = "roto" ]; then
  # El código de ANTES, en un árbol aparte: sus `@/…` resuelven a SUS ficheros.
  # Dentro de `(cd "$ANTES" && …)` el `$PWD` ya es el árbol: por eso `$RAIZ`.
  ANTES="$RAIZ/lib/__tests__/.antes/pagina-de-plan"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$ANTES/node_modules"
  cp lib/__tests__/fingido/entrada-de-pagina-de-plan-antes.ts \
     lib/__tests__/fingido/pagina-de-plan-harness-antes.tsx \
     "$ANTES/lib/__tests__/fingido/"
  (cd "$ANTES" && npx esbuild lib/__tests__/fingido/entrada-de-pagina-de-plan-antes.ts --bundle \
    --platform=node --format=esm --outdir="$RAIZ/$OUT" \
    --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
    "${ALIAS_NODO[@]}")
  sed -i '/server-only/d' "$OUT/entrada-de-pagina-de-plan-antes.js"
  (cd "$ANTES" && npx esbuild lib/__tests__/fingido/pagina-de-plan-harness-antes.tsx --bundle --format=iife \
    --outfile="$RAIZ/$OUT/harness-antes.js" --jsx=automatic \
    --define:process.env.NODE_ENV=\"production\" --define:process.env='{}' \
    --alias:next/link=./lib/__tests__/fingido/next-link-ssr.tsx --log-level=error)
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree prune
  node --test lib/__tests__/pagina-de-plan.test.mjs "$@"
  exit $?
fi

# 1. La regla pura (y las guías publicadas, para comprobar que existen).
npx esbuild lib/pagina-de-plan.ts lib/tutoriales-del-modulo.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --external:@prisma/client --log-level=error

# 2. Las acciones y la página armada, contra Postgres.
npx esbuild lib/__tests__/fingido/entrada-de-pagina-de-plan.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" "${ALIAS_NODO[@]}"
sed -i '/server-only/d' "$OUT/entrada-de-pagina-de-plan.js"

# 3. La pantalla, con el componente REAL.
npx esbuild lib/__tests__/fingido/pagina-de-plan-harness.tsx --bundle --format=iife \
  --outfile="$OUT/harness.js" --jsx=automatic \
  --define:process.env.NODE_ENV=\"production\" --define:process.env='{}' \
  --alias:next/link=./lib/__tests__/fingido/next-link-ssr.tsx --log-level=error

node --test lib/__tests__/pagina-de-plan.test.mjs "$@"
