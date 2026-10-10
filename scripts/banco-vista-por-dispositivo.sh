#!/usr/bin/env bash
# La pantalla que comparte Verzy en la videollamada se ve en el formato de CADA
# sala: vertical en el teléfono, intermedio en la tableta, horizontal en el
# ordenador, con la misma página para todos.
#
# Antes era UNA ventana por cita y la última sala en decir su tamaño se la
# quedaba. Ahora la ventana de Verzy (el conductor) toma el dispositivo de la
# primera sala y cada otro dispositivo tiene su ESPEJO, que la sigue.
#
#   1. Las reglas puras (`laVistaQueToca`, `laRutaQueSigueElEspejo`,
#      `laProporcionBajada`).
#   2. La pantalla de Verzy de verdad (Chromium por CDP) contra Postgres y una
#      plataforma de mentira: tres salas (teléfono, ordenador, tableta), cada
#      flujo medido por su JPEG; la misma página con el agente de cada aparato;
#      los espejos bajan y cambian de página con Verzy.
#
# `MODO=roto` carga la pantalla de `ANTES_REF` (8488992, pinchado a un commit,
# nunca `origin/main`) y AFIRMA el fallo: el teléfono y el ordenador recibían
# el mismo fotograma.
#
# Uso:  scripts/banco-vista-por-dispositivo.sh
#       MODO=roto scripts/banco-vista-por-dispositivo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:$(pwd)/node_modules:/opt/node22/lib/node_modules"
export MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-8488992}"
OUT=lib/__tests__/.compilado/vista-por-dispositivo
mkdir -p "$OUT"
RAIZ="$(pwd)"
AQUI="$(pwd)"

limpiar() { [ -n "${ARBOL:-}" ] && git worktree remove --force "$ARBOL" 2>/dev/null || true; }
trap limpiar EXIT

if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  RAIZ="$ARBOL"
else
  # ── 1. Las reglas puras ───────────────────────────────────────────────────
  npx esbuild lib/pantalla-de-verzy.ts --bundle --format=esm --platform=node \
    --outfile="$OUT/puro.js" --log-level=error
  node --test lib/__tests__/vista-por-dispositivo-puro.test.mjs
fi

# ── 2. La pantalla de verdad ────────────────────────────────────────────────
PGDIR=/tmp/pgvistapordispositivo
PGPORT=55496
if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PGPORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/dropdb -h $PGDIR -p $PGPORT -U postgres --if-exists banco" 2>/dev/null || true
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PGPORT -U postgres banco"
export DATABASE_URL="postgresql://postgres@localhost:$PGPORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export PORT=3977
export CHROMIUM_PATH=/opt/pw-browsers/chromium
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost S3_PUBLIC_URL=http://bucket.test GEMINI_API_KEY=banco

F="$AQUI/lib/__tests__/vista-por-dispositivo/fingidos.ts"
npx esbuild "$AQUI/lib/__tests__/vista-por-dispositivo/entrada.ts" --bundle \
  --platform=node --format=esm --outfile="$AQUI/$OUT/entrada.js" \
  --external:@prisma/client --external:playwright-core \
  --tsconfig="$RAIZ/tsconfig.json" \
  --alias:@/lib/videollamada-en-vivo.server="$F" \
  --alias:@/lib/videollamada-crm.server="$F" \
  --alias:@/lib/sesion-de-verzy.server="$F" \
  --alias:@="$RAIZ" \
  --alias:server-only="$AQUI/lib/__tests__/fingido/server-only-vacio.ts" \
  --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" \
  --log-level=error
node --test lib/__tests__/vista-por-dispositivo.test.mjs
echo "── banco de la vista por dispositivo: OK (MODO=$MODO) ──"
