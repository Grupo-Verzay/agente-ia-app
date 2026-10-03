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
# Y un segundo fichero (`plan-al-final.test.mjs`) con las cinco mejoras que
# vinieron después: el video subido como archivo (la ruta, el uploader y el
# `<video>` de la landing), el botón de comenzar SOLO al final, «para quién es
# este plan», la línea discreta hacia el plan inmediato superior, y la marca de
# «destacar en la tarjeta corta» separada de «activa en el plan».
#
# Y un tercero (`plan-en-bloques.test.mjs`): la página arranca con el video sin
# bloque de cabecera, la landing lleva directo a la página (sin ventana
# intermedia), «qué incluye» son tarjetas sueltas en el orden del editor, los
# seis bloques se reordenan desde el panel, y los recuadros de catálogo y
# asistencia se editan (un plan sin catálogo no enseña ese recuadro).
#
# `MODO=roto` corre las mismas pruebas contra el código de antes —pinchado a un
# commit, nunca `origin/main`— y AFIRMA los fallos. Son dos «antes», uno por
# fichero: ANTES_REF (la página copiaba `features` tal cual, enseñaba un plan
# apagado, pintaba testimonios y el guardado parcial borraba lo demás) y
# ANTES_DE_LO_NUEVO (sin ruta de video, dos botones de comenzar, uno fijo
# arriba, sin «para quién», sin plan superior y la tarjeta con TODAS). Y
# ANTES_DE_LOS_BLOQUES (la cabecera con nombre y precio encima del video, las
# funciones agrupadas por categoría, «No incluido» y la ventana intermedia).
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-88ade1f}"
export ANTES_REF
ANTES_DE_LO_NUEVO="${ANTES_DE_LO_NUEVO:-fd21c8f}"
export ANTES_DE_LO_NUEVO
ANTES_DE_LOS_BLOQUES="${ANTES_DE_LOS_BLOQUES:-0b7c21f}"
export ANTES_DE_LOS_BLOQUES

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
  --alias:@/lib/minio=./lib/__tests__/fingido/minio-de-video.ts
  --alias:next/server=./lib/__tests__/fingido/next-server.ts
  --log-level=error
)
BANNER_ESM='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);'
ALIAS_TARJETA=(
  --alias:next/link=./lib/__tests__/fingido/next-link-ssr.tsx
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-mudo.ts
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
    --banner:js="$BANNER_ESM" "${ALIAS_NODO[@]}")
  sed -i '/server-only/d' "$OUT/entrada-de-pagina-de-plan-antes.js"
  (cd "$ANTES" && npx esbuild lib/__tests__/fingido/pagina-de-plan-harness-antes.tsx --bundle --format=iife \
    --outfile="$RAIZ/$OUT/harness-antes.js" --jsx=automatic \
    --define:process.env.NODE_ENV=\"production\" --define:process.env='{}' \
    --alias:next/link=./lib/__tests__/fingido/next-link-ssr.tsx --log-level=error)
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"

  # El código de antes de las cinco mejoras: la página con su botón fijo y la
  # tarjeta de la landing (que entonces no se exportaba: se le pone `export`
  # para poder pintarla sola, sin tocar nada de lo que hace).
  ANTES2="$RAIZ/lib/__tests__/.antes/plan-al-final"
  git worktree remove --force "$ANTES2" 2>/dev/null || rm -rf "$ANTES2"
  git worktree add --detach "$ANTES2" "$ANTES_DE_LO_NUEVO" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$ANTES2/node_modules"
  cp lib/__tests__/fingido/entrada-antes-de-lo-nuevo.ts \
     lib/__tests__/fingido/tarjeta-de-plan-harness.tsx \
     lib/__tests__/fingido/minio-de-video.ts \
     lib/__tests__/fingido/next-server.ts \
     "$ANTES2/lib/__tests__/fingido/"
  sed -i 's/^function PlanCard(/export function PlanCard(/' "$ANTES2/app/(public)/inicio/_components/LandingClient.tsx"
  (cd "$ANTES2" && npx esbuild lib/__tests__/fingido/entrada-antes-de-lo-nuevo.ts --bundle \
    --platform=node --format=esm --outdir="$RAIZ/$OUT" --banner:js="$BANNER_ESM" "${ALIAS_NODO[@]}")
  sed -i '/server-only/d' "$OUT/entrada-antes-de-lo-nuevo.js"
  (cd "$ANTES2" && npx esbuild lib/__tests__/fingido/pagina-de-plan-harness.tsx --bundle --format=iife \
    --outfile="$RAIZ/$OUT/harness-lo-nuevo-antes.js" --jsx=automatic \
    --define:process.env.NODE_ENV=\"production\" --define:process.env='{}' \
    --alias:next/link=./lib/__tests__/fingido/next-link-ssr.tsx --log-level=error)
  (cd "$ANTES2" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
    lib/__tests__/fingido/tarjeta-de-plan-harness.tsx "$RAIZ/$OUT/tarjeta-antes.js" "${ALIAS_TARJETA[@]}")
  git worktree remove --force "$ANTES2" 2>/dev/null || rm -rf "$ANTES2"

  # El código de antes de los bloques: la cabecera encima del video, los grupos
  # por categoría y la ventana intermedia de la landing.
  ANTES3="$RAIZ/lib/__tests__/.antes/plan-en-bloques"
  git worktree remove --force "$ANTES3" 2>/dev/null || rm -rf "$ANTES3"
  git worktree add --detach "$ANTES3" "$ANTES_DE_LOS_BLOQUES" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$ANTES3/node_modules"
  cp lib/__tests__/fingido/tarjeta-de-plan-harness.tsx \
     lib/__tests__/fingido/minio-de-video.ts \
     lib/__tests__/fingido/next-server.ts \
     "$ANTES3/lib/__tests__/fingido/"
  (cd "$ANTES3" && npx esbuild lib/__tests__/fingido/entrada-de-pagina-de-plan.ts --bundle \
    --platform=node --format=esm --outfile="$RAIZ/$OUT/entrada-bloques-antes.js" \
    --banner:js="$BANNER_ESM" "${ALIAS_NODO[@]}")
  sed -i '/server-only/d' "$OUT/entrada-bloques-antes.js"
  (cd "$ANTES3" && npx esbuild lib/__tests__/fingido/pagina-de-plan-harness.tsx --bundle --format=iife \
    --outfile="$RAIZ/$OUT/harness-bloques-antes.js" --jsx=automatic \
    --define:process.env.NODE_ENV=\"production\" --define:process.env='{}' \
    --alias:next/link=./lib/__tests__/fingido/next-link-ssr.tsx --log-level=error)
  (cd "$ANTES3" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
    lib/__tests__/fingido/tarjeta-de-plan-harness.tsx "$RAIZ/$OUT/tarjeta-bloques-antes.js" "${ALIAS_TARJETA[@]}")
  git worktree remove --force "$ANTES3" 2>/dev/null || rm -rf "$ANTES3"
  git worktree prune

  # Los tres ficheros comparten la base: uno detrás de otro, nunca a la vez.
  node --test --test-concurrency=1 lib/__tests__/pagina-de-plan.test.mjs lib/__tests__/plan-al-final.test.mjs lib/__tests__/plan-en-bloques.test.mjs "$@"
  exit $?
fi

# 1. La regla pura (y las guías publicadas, para comprobar que existen).
npx esbuild lib/pagina-de-plan.ts lib/tutoriales-del-modulo.ts lib/video-subido.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --external:@prisma/client --log-level=error

# 2. Las acciones y la página armada, contra Postgres.
npx esbuild lib/__tests__/fingido/entrada-de-pagina-de-plan.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" --banner:js="$BANNER_ESM" "${ALIAS_NODO[@]}"
sed -i '/server-only/d' "$OUT/entrada-de-pagina-de-plan.js"

# 3. La pantalla, con el componente REAL.
npx esbuild lib/__tests__/fingido/pagina-de-plan-harness.tsx --bundle --format=iife \
  --outfile="$OUT/harness.js" --jsx=automatic \
  --define:process.env.NODE_ENV=\"production\" --define:process.env='{}' \
  --alias:next/link=./lib/__tests__/fingido/next-link-ssr.tsx --log-level=error

# 4. La tarjeta corta de la landing y su video, los de VERDAD.
node scripts/empaquetar-con-acciones-mudas.mjs lib/__tests__/fingido/tarjeta-de-plan-harness.tsx \
  "$OUT/tarjeta.js" "${ALIAS_TARJETA[@]}"

node --test --test-concurrency=1 lib/__tests__/pagina-de-plan.test.mjs lib/__tests__/plan-al-final.test.mjs lib/__tests__/plan-en-bloques.test.mjs "$@"
