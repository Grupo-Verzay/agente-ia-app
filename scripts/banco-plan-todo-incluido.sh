#!/usr/bin/env bash
# El banco de «Todo incluido, sin sorpresas» en la página de cada plan.
#
# Un bloque nuevo de la página pública del plan, editable POR PLAN en el panel
# (Planes › Página de detalle): un título (de fábrica «Todo incluido, sin
# sorpresas») y un texto libre con lo que el plan trae sin costo adicional,
# que sale ENTERO y a la vista, sin desplegar nada, entre «Preguntas
# frecuentes» y el precio con «Comenzar con el plan». Es aparte de «Qué incluye
# este plan» (las funciones). Y una propuesta que carga ese plan lo hereda:
# en el alcance de la fila y en la página pública de la propuesta.
#
# Tres mitades: la REGLA pura (el orden, el saneado, lo que sale y el alcance);
# las ACCIONES contra Postgres (guardar por plan, la página y la propuesta lo
# leen en vivo, guardar otra cosa no lo borra, un cliente no lo escribe); y la
# PANTALLA real en Chromium sobre el CSS del build (la página a 1440 y 390, el
# plan dentro de una propuesta y el editor del panel).
#
# El texto sale en TARJETAS, una por línea, con el aspecto de los recuadros de
# capacidad: dos columnas en computador y tablet, una en el móvil (se mide a
# 1440, 1024, 768 y 390 de ancho).
#
# `MODO=roto` lee el código de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y AFIRMA que no existía nada de esto; y el de
# ANTES_TARJETAS_REF, y AFIRMA que el texto salía en una sola caja.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-8302e3e}"
ANTES_TARJETAS_REF="${ANTES_TARJETAS_REF:-7343076}"
export ANTES_REF ANTES_TARJETAS_REF

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/plan-todo-incluido.test.mjs "$@"
  exit $?
fi

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

OUT=lib/__tests__/.compilado/plan-todo-incluido
rm -rf "$OUT"
mkdir -p "$OUT"

# 1. La regla pura.
npx esbuild lib/pagina-de-plan.ts lib/plan-de-la-propuesta.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --external:@prisma/client --log-level=error

# 2. Las acciones contra Postgres de usar y tirar.
PGDIR=/tmp/pgtodoincluido
PORT=55683
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

npx esbuild lib/__tests__/fingido/entrada-de-todo-incluido.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only --external:next/headers \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:@/actions/whatsapp-dispatcher=./lib/__tests__/fingido/despacho-de-propuestas.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --alias:@/lib/minio=./lib/__tests__/fingido/minio-de-video.ts \
  --alias:next/server=./lib/__tests__/fingido/next-server.ts \
  --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-todo-incluido.js"

# 3. La pantalla: la página del plan, el plan en una propuesta y el editor del
#    panel, con los componentes de VERDAD y las acciones mudas.
F=./lib/__tests__/fingido
node scripts/empaquetar-con-acciones-mudas.mjs lib/__tests__/fingido/todo-incluido-harness.tsx "$OUT/harness.js" \
  "--alias:next/link=$F/next-link-ssr.tsx" \
  "--alias:next/navigation=$F/guia-tema/next-navigation.ts" \
  "--alias:@/lib/introduccion-publica.server=$F/guia-tema/introduccion-publica.ts" \
  "--alias:@/lib/contacto-de-la-guia.server=$F/guia-tema/contacto-de-la-guia.ts" \
  "--alias:@/actions/guia-publica-actions=$F/guia-tema/guia-publica-actions.ts" \
  "--alias:@/actions/plan-detail-actions=$F/acciones-del-todo-incluido.ts"

node --test --test-concurrency=1 lib/__tests__/plan-todo-incluido.test.mjs "$@"
