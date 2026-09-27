#!/usr/bin/env bash
# El banco de la ENCUESTA DE SATISFACCIÓN (NPS).
#
# Dos mitades, porque el cambio vive en dos capas:
#
#   1. Las REGLAS, puras: qué respuesta cuenta como puntuación, en qué grupo
#      cae, cómo sale el NPS —total y por asesor— y un BARRIDO del código que
#      exige que resolver, la ficha, el CRM y el ajuste usen esas reglas y no
#      una copia, y que el ajuste y la sección de NPS tengan la forma de sus
#      vecinas (el escalado y las llamadas).
#   2. Las ACCIONES contra POSTGRES: resolver manda la pregunta por la línea de
#      la conversación solo con la encuesta encendida, no la repite, la
#      respuesta queda en la ficha y en el NPS con su asesor, y el alcance es
#      el del CRM (la madre ve a su hija, nunca al revés).
#
# `MODO=roto` corre el `resolveSession` de ANTES_REF —sacado de git— con la
# encuesta ENCENDIDA y AFIRMA el fallo: resolver no preguntaba nada. El «antes»
# va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se fusione,
# `origin/main` pasa a ser el «ahora» y el modo roto se pondría verde sin
# ejercer nada.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-aecdcef}"

OUT=lib/__tests__/.compilado/encuesta
mkdir -p "$OUT"

# ── 1. Las reglas ───────────────────────────────────────────────────────────
npx esbuild lib/encuesta-de-satisfaccion.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --alias:@="$(pwd)" --log-level=error

# ── 2. Las acciones contra Postgres ────────────────────────────────────────
PGDIR=/tmp/pgencuesta
PORT=55503
if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
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

ENTRADA=entrada-de-la-encuesta
ANTES_DIR=lib/__tests__/.antes/encuesta
trap 'rm -rf "$ANTES_DIR"' EXIT
if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_DIR/actions"
  git show "$ANTES_REF:actions/advisor-assign-actions.ts" > "$ANTES_DIR/actions/advisor-assign-actions.ts"
  ENTRADA=entrada-de-la-encuesta-antes
fi

npx esbuild "lib/__tests__/fingido/$ENTRADA.ts" --bundle \
  --platform=node --format=esm --outfile="$OUT/$ENTRADA.js" \
  --alias:@="$(pwd)" \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-finanzas.ts \
  --alias:@/actions/conversation-intelligence-actions=./lib/__tests__/fingido/intel-muda.ts \
  --alias:@/actions/google-sheets-actions=./lib/__tests__/fingido/intel-muda.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --external:@prisma/client --external:server-only \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error
sed -i '/server-only/d' "$OUT/$ENTRADA.js"

node --test --test-concurrency=1 \
  lib/__tests__/encuesta-de-satisfaccion.test.mjs \
  lib/__tests__/encuesta-de-satisfaccion-db.test.mjs "$@"
