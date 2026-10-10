#!/usr/bin/env bash
# De varias grabaciones de la misma cita, al CRM va la que dura MÁS DE VERDAD
# (la mide `ffmpeg`), no la que estuvo más rato abierta en el navegador.
#
# Una videollamada de 3:40 se oía entera recién colgada y luego solo traía 36 s:
# la sala reabierta en segundo plano (el teléfono recarga la pestaña al volver
# al navegador) grabó 36 s en varios minutos de reloj, y con «la más larga»
# medida por el reloj del navegador, tapó a la buena en el CRM.
#
#   1. La regla pura (`losSegundosDeLaGrabacion`).
#   2. Dos grabaciones de la misma cita contra Postgres, el bucket de mentira y
#      el `ffmpeg` de verdad: la buena sigue en el CRM y cada una apunta lo que
#      dura de verdad.
#
# `MODO=roto` compila la ruta y el cierre de `ANTES_REF` (0442bbb, pinchado a un
# commit, nunca `origin/main`) y AFIRMA el fallo: la corta tapaba a la buena.
#
# Uso:  scripts/banco-grabacion-la-mas-larga.sh
#       MODO=roto scripts/banco-grabacion-la-mas-larga.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:$(pwd)/node_modules:/opt/node22/lib/node_modules"
export MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-0442bbb}"
OUT=lib/__tests__/.compilado/grabacion-la-mas-larga
mkdir -p "$OUT" lib/__tests__/.compilado/grabacion-de-videollamada
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
  # ── 1. La regla pura ──────────────────────────────────────────────────────
  npx esbuild lib/grabacion-de-videollamada.ts --bundle --format=esm --platform=node \
    --alias:@="$(pwd)" --outfile=lib/__tests__/.compilado/grabacion-de-videollamada/puro.js --log-level=error
  npx esbuild lib/grabacion-de-reunion.ts --bundle --format=esm --platform=node \
    --alias:@="$(pwd)" --outfile=lib/__tests__/.compilado/grabacion-de-videollamada/reunion.js --log-level=error
  node --test lib/__tests__/grabacion-de-videollamada.test.mjs
fi

# ── 2. Dos grabaciones de la misma cita, contra Postgres ────────────────────
PGDIR=/tmp/pglamaslarga
PORT=55494
if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/dropdb -h $PGDIR -p $PORT -U postgres --if-exists banco" 2>/dev/null || true
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco"
export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost S3_PUBLIC_URL=http://bucket.test GEMINI_API_KEY=banco
npx prisma db push --skip-generate --accept-data-loss >/dev/null

# El bucket de mentira es el de AHORA (acepta ficheros por flujo) en los dos modos.
npx esbuild "$RAIZ/lib/__tests__/fingido/entrada-grabacion-de-videollamada.ts" --bundle \
  --platform=node --format=esm --outdir="$AQUI/$OUT" \
  --external:@prisma/client \
  --tsconfig="$RAIZ/tsconfig.json" \
  --alias:@/lib/__tests__/fingido/minio-de-la-videollamada="$AQUI/lib/__tests__/fingido/minio-de-la-videollamada.ts" \
  --alias:@/lib/minio="$AQUI/lib/__tests__/fingido/minio-de-la-videollamada.ts" \
  --alias:minio="$AQUI/lib/__tests__/fingido/minio-de-la-videollamada.ts" \
  --alias:@="$RAIZ" \
  --alias:server-only="$AQUI/lib/__tests__/fingido/server-only-vacio.ts" \
  --alias:next/server="$AQUI/lib/__tests__/fingido/next-server.ts" \
  --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" \
  --log-level=error
node --test lib/__tests__/grabacion-la-mas-larga-db.test.mjs
echo "── banco de la grabación más larga: OK (MODO=$MODO) ──"
