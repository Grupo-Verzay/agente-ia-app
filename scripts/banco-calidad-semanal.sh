#!/usr/bin/env bash
# El banco de la CALIDAD SEMANAL: cuándo se evalúa (CRM › Calidad) y la sección
# nueva del reporte semanal.
#
# Dos mitades:
#   1. La REGLA y un BARRIDO, sin base: el resumen de la semana (promedio, mejor
#      asesor, el dueño que atiende solo), las líneas que comparten el WhatsApp y
#      la pantalla de Reportes, y quién dispara la evaluación.
#   2. El CORTE SEMANAL de verdad contra Postgres (`runWeeklyReportForAllUsers`),
#      con la IA y el envío de WhatsApp fingidos: evalúa sin esperar reposo y el
#      reporte sale con su sección.
#
# `MODO=roto` empaqueta las MISMAS pruebas contra ANTES_REF —pinchado a un
# commit, nunca `origin/main`— y afirma los fallos: el cron diario lanzaba el
# barrido, se esperaban dos horas de reposo y el reporte no decía nada de la
# calidad.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:$PATH"
MODO="${MODO:-bueno}"
export MODO
export ANTES_REF="${ANTES_REF:-2017da3}"

RAIZ="$PWD"
OUT="$RAIZ/lib/__tests__/.compilado/calidad-semanal"
rm -rf "$OUT" && mkdir -p "$OUT"

ARBOL="$RAIZ"
if [ "$MODO" = "roto" ]; then
  ARBOL=/tmp/banco-calidad-semanal-antes
  rm -rf "$ARBOL"; git worktree prune
  git worktree add --detach "$ARBOL" "$ANTES_REF" >/dev/null
  ln -s "$RAIZ/node_modules" "$ARBOL/node_modules"
  mkdir -p "$ARBOL/lib/__tests__/fingido"
  cp lib/__tests__/fingido/{despachador-de-mentira,openai-de-la-calidad,entrada-de-calidad-semanal}.ts "$ARBOL/lib/__tests__/fingido/"
fi

(cd "$ARBOL" && npx esbuild lib/calidad-de-conversaciones.ts --bundle --platform=node --format=esm \
   --outfile="$OUT/calidad-de-conversaciones.js" --log-level=error)

PGDIR=/tmp/pgcalidadsemanal
PORT=55533
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

(cd "$ARBOL" && npx esbuild lib/__tests__/fingido/entrada-de-calidad-semanal.ts --bundle \
  --platform=node --format=esm --outfile="$OUT/entrada-de-calidad-semanal.js" \
  --external:@prisma/client --external:server-only --external:@google/genai \
  --alias:@/actions/whatsapp-dispatcher=./lib/__tests__/fingido/despachador-de-mentira.ts \
  --alias:openai=./lib/__tests__/fingido/openai-de-la-calidad.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error)
sed -i '/server-only/d' "$OUT/entrada-de-calidad-semanal.js"

if [ "$MODO" = "roto" ]; then
  git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true
fi

node --test --test-concurrency=1 lib/__tests__/calidad-semanal.test.mjs \
            lib/__tests__/calidad-semanal-db.test.mjs "$@"
