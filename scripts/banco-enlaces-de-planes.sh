#!/usr/bin/env bash
# El banco de los ENLACES y el NOMBRE de los planes.
#
# Cuatro fallos de la zona de planes, y lo que los cierra:
#  1. la landing vendía el nombre ANTERIOR de un nivel: ahora el nombre es uno
#     por nivel, se escribe en todas sus filas y se lee con una regla;
#  2. la modalidad (`?tipo=HUMANO`, `&a=HUMANO`) iba en la dirección: ahora va
#     en una cookie que el servidor valida;
#  3. la dirección lleva el NIVEL (`/planes/nivel-2`), no el nombre interno;
#  4. «Ver todo lo que incluye» y «Comenzar ahora» iban pegados.
#
# Dos mitades en `enlaces-de-planes.test.mjs` (la regla y un barrido; las
# acciones contra Postgres; las seis tarjetas reales en Chromium) y, en modo
# bueno, la página SERVIDA (`probar-enlaces-de-planes.mjs`): las redirecciones
# del middleware con su cookie y los enlaces de la landing.
#
# `MODO=roto` corre las mismas pruebas contra ANTES_REF —pinchado a un commit,
# nunca `origin/main`— y AFIRMA los cuatro fallos. La sonda servida no tiene
# modo roto: serían dos builds.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-a5a9371}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

RAIZ="$PWD"
OUT=lib/__tests__/.compilado/enlaces-de-planes
rm -rf "$OUT"
mkdir -p "$OUT"

# ── Postgres de usar y tirar ─────────────────────────────────────────────────
PGDIR=/tmp/pgenlacesdeplanes
PORT=55663
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
  --external:@prisma/client --external:server-only
  --alias:next/headers=./lib/__tests__/fingido/cookies-de-planes.ts
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
  ANTES="$RAIZ/lib/__tests__/.antes/enlaces-de-planes"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$ANTES/node_modules"
  cp lib/__tests__/fingido/entrada-de-enlaces-de-planes-antes.ts \
     lib/__tests__/fingido/tarjetas-de-planes-harness.tsx \
     lib/__tests__/fingido/minio-de-video.ts \
     lib/__tests__/fingido/next-server.ts \
     lib/__tests__/fingido/cookies-de-planes.ts \
     "$ANTES/lib/__tests__/fingido/"
  (cd "$ANTES" && npx esbuild lib/__tests__/fingido/entrada-de-enlaces-de-planes-antes.ts --bundle \
    --platform=node --format=esm --outdir="$RAIZ/$OUT" --banner:js="$BANNER_ESM" "${ALIAS_NODO[@]}")
  sed -i '/server-only/d' "$OUT/entrada-de-enlaces-de-planes-antes.js"
  (cd "$ANTES" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
    lib/__tests__/fingido/tarjetas-de-planes-harness.tsx "$RAIZ/$OUT/tarjetas-antes.js" "${ALIAS_TARJETA[@]}")
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree prune

  node --test --test-concurrency=1 lib/__tests__/enlaces-de-planes.test.mjs "$@"
  exit $?
fi

# 1. La regla pura.
for f in lib/enlaces-de-planes.ts lib/nombre-del-nivel.ts types/plans.ts; do
  npx esbuild "$f" --bundle --platform=node --format=esm \
    --outfile="$OUT/$(basename "${f%.ts}").js" --external:@prisma/client --log-level=error
done

# 2. Las acciones contra Postgres.
npx esbuild lib/__tests__/fingido/entrada-de-enlaces-de-planes.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" --banner:js="$BANNER_ESM" "${ALIAS_NODO[@]}"
sed -i '/server-only/d' "$OUT/entrada-de-enlaces-de-planes.js"

# 3. Las seis tarjetas de la landing, las de VERDAD.
node scripts/empaquetar-con-acciones-mudas.mjs lib/__tests__/fingido/tarjetas-de-planes-harness.tsx \
  "$OUT/tarjetas.js" "${ALIAS_TARJETA[@]}"

node --test --test-concurrency=1 lib/__tests__/enlaces-de-planes.test.mjs "$@"

# 4. La página SERVIDA: el middleware y la landing de verdad.
APPPORT=3957
AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APPPORT" setsid npx next start -p "$APPPORT" >/tmp/enlaces-de-planes-next.log 2>&1 &
APP=$!
trap 'kill -- -$APP 2>/dev/null || true' EXIT
for _ in $(seq 1 90); do
  curl -s -o /dev/null "http://localhost:$APPPORT/inicio" && break
  sleep 1
done
BASE="http://localhost:$APPPORT" node scripts/probar-enlaces-de-planes.mjs
