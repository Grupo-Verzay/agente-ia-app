#!/usr/bin/env bash
# El banco del SENTIMIENTO del cliente en Chats: el aro del avatar, la franja de
# alerta de la conversación abierta y el reporte del CRM.
#
# Cuatro mitades (ver la cabecera de `lib/__tests__/sentimiento.test.mjs`): las
# reglas puras, un barrido del código, el análisis contra POSTGRES con la IA
# fingida, y la franja de verdad en CHROMIUM sobre el CSS del build.
#
# `MODO=roto` lee los ficheros de ANTES_REF —pinchado a un commit, nunca
# `origin/main`, que pasa a ser el «ahora» en cuanto esto se fusione— y AFIRMA
# el fallo: no había análisis, ni aro de color, ni franja, ni reporte.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export MODO="${MODO:-bueno}"
export ANTES_REF="${ANTES_REF:-aecdcef}"
# El «antes» de la calibración y del interruptor (pinchado, no origin/main).
export ANTES_DE_CALIBRAR="${ANTES_DE_CALIBRAR:-2114b64}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

OUT=lib/__tests__/.compilado/sentimiento
mkdir -p "$OUT"

# 1. Las reglas puras
npx esbuild lib/sentimiento.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --log-level=error
mkdir -p "$OUT/antes"
git show "$ANTES_DE_CALIBRAR:lib/sentimiento.ts" > "$OUT/antes/sentimiento.ts"
npx esbuild "$OUT/antes/sentimiento.ts" --bundle --platform=node --format=esm \
  --outfile="$OUT/antes/sentimiento.js" --log-level=error

# 3. El análisis contra Postgres
PGDIR=/tmp/pgsentimiento
PORT=55511
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

npx esbuild lib/__tests__/fingido/entrada-del-sentimiento.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-del-sentimiento.js"

# 4. La franja de verdad, para el navegador
npx esbuild lib/__tests__/fingido/entrada-de-la-franja.tsx --bundle \
  --format=iife --outfile="$OUT/harness-franja.js" --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

# En serie y en este orden: el primero crea las tablas del chat que el segundo usa.
node --test --test-concurrency=1 lib/__tests__/sentimiento.test.mjs lib/__tests__/sentimiento-calibracion.test.mjs "$@"
