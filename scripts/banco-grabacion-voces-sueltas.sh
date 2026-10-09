#!/usr/bin/env bash
# La grabación de la videollamada sin depender de un toque en la página.
#
# Antes la sala mezclaba las voces con un `AudioContext` y metía la mezcla en
# el video. Un `AudioContext` nacido sin un toque nace PARADO (en el teléfono,
# casi siempre), y parado no se grababa NADA: en el teléfono la llamada no
# dejaba ni un byte, en el ordenador empezaba con el primer clic, y el arreglo
# de #1214 pedía un toque con un botón. Ahora el video es solo el lienzo, cada
# voz va suelta con su `MediaRecorder` y su `desde`, y el servidor las mezcla
# con `ffmpeg` al cerrar.
#
#   1. Las reglas puras: las llaves de cada voz y las órdenes de `ffmpeg`.
#   2. La ruta y el cierre contra Postgres, un bucket de mentira y el `ffmpeg`
#      de verdad: cada voz en su sitio (una entra a los 4 s), el video copiado
#      con la mezcla dentro, techo de voces, y sin `ffmpeg` no se pierde nada.
#   3. La sala MONTADA en Chromium con la regla del navegador FINGIDA (el
#      `AudioContext` no arranca sin un clic): graba SOLA desde que entra, sin
#      botón, y lo que sube, mezclado, es un video 1280×720 con las dos voces.
#
# `MODO=roto` monta la sala de `ANTES_REF` (fb40429, pinchado a un commit,
# nunca `origin/main`) y AFIRMA el fallo: sin un toque no subía ni un byte de
# video, y salía el botón que pedía tocar.
#
# Uso:  scripts/banco-grabacion-voces-sueltas.sh
#       MODO=roto scripts/banco-grabacion-voces-sueltas.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:$(pwd)/node_modules:/opt/node22/lib/node_modules"
export MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-fb40429}"
OUT=lib/__tests__/.compilado/grabacion-de-voces
mkdir -p "$OUT" lib/__tests__/.compilado/grabacion-de-videollamada

limpiar() { [ -n "${ARBOL:-}" ] && git worktree remove --force "$ARBOL" 2>/dev/null || true; }
trap limpiar EXIT

# Las reglas puras (también las usa la prueba de la sala para mezclar).
npx esbuild lib/grabacion-de-videollamada.ts --bundle --format=esm --platform=node \
  --alias:@="$(pwd)" --outfile=lib/__tests__/.compilado/grabacion-de-videollamada/puro.js --log-level=error
npx esbuild lib/grabacion-de-reunion.ts --bundle --format=esm --platform=node \
  --alias:@="$(pwd)" --outfile=lib/__tests__/.compilado/grabacion-de-videollamada/reunion.js --log-level=error

if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DEL_ANTES="$ARBOL"
else
  # ── 1. Las reglas puras ───────────────────────────────────────────────────
  node --test lib/__tests__/grabacion-de-videollamada.test.mjs

  # ── 2. La ruta y el cierre contra Postgres, con el ffmpeg de verdad ───────
  PGDIR=/tmp/pgvocessueltas
  PORT=55493
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

  npx esbuild lib/__tests__/fingido/entrada-grabacion-de-videollamada.ts --bundle \
    --platform=node --format=esm --outdir="$OUT" \
    --external:@prisma/client \
    --alias:@="$(pwd)" \
    --alias:server-only=./lib/__tests__/fingido/server-only-vacio.ts \
    --alias:@/lib/minio=./lib/__tests__/fingido/minio-de-la-videollamada.ts \
    --alias:minio=./lib/__tests__/fingido/minio-de-la-videollamada.ts \
    --alias:next/server=./lib/__tests__/fingido/next-server.ts \
    --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" \
    --log-level=error
  node --test lib/__tests__/grabacion-de-voces-db.test.mjs
fi

# ── 3. La sala en Chromium, sin un solo toque ───────────────────────────────
node --test lib/__tests__/sala-que-graba-sin-clic.test.mjs
echo "── banco de la grabación con voces sueltas: OK (MODO=$MODO) ──"
