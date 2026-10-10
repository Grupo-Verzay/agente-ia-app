#!/usr/bin/env bash
# La videollamada se ve COMPLETA, y «Salir» deja de cobrar.
#
#   1. Las reglas puras: Tavus espera UN minuto si se cae la conexión (antes
#      tres, cobrados), y cuándo colgar termina la conversación.
#   2. Contra Postgres, el bucket de mentira y el `ffmpeg` de verdad:
#      - una llamada cortada por una recarga (dos partes) se une EN ORDEN en un
#        video que va al CRM con la duración de todo;
#      - `DELETE /api/videollamada/sala` (firma de la cita) termina la
#        conversación en Tavus con su clave y la marca finalizada, una vez.
#   3. La sala en Chromium: «Salir» la termina; un asesor que sale con el
#      cliente dentro, no.
#
# `MODO=roto` usa el código de `ANTES_REF` (8488992, pinchado a un commit, nunca
# `origin/main`) y AFIRMA los fallos: el CRM enseñaba solo la parte más larga,
# no había cómo terminar la conversación, y al salir la sala no la terminaba.
#
# Uso:  scripts/banco-grabacion-completa.sh
#       MODO=roto scripts/banco-grabacion-completa.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:$(pwd)/node_modules:/opt/node22/lib/node_modules"
export MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-8488992}"
OUT=lib/__tests__/.compilado/grabacion-completa
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
  export RAIZ_DEL_ANTES="$ARBOL"
else
  # ── 1. La regla pura ──────────────────────────────────────────────────────
  npx esbuild lib/fin-de-la-videollamada.ts --bundle --format=esm --platform=node \
    --alias:@="$(pwd)" --outfile="$OUT/fin.js" --log-level=error
  node --test lib/__tests__/fin-de-la-videollamada-salir.test.mjs
fi

# ── 2. Dos grabaciones de la misma cita, contra Postgres ────────────────────
PGDIR=/tmp/pggrabacioncompleta
PORT=55497
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
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost S3_PUBLIC_URL=http://bucket.test GEMINI_API_KEY=banco \
       TAVUS_API_KEY=clave-de-tavus-del-banco-0123456789 TAVUS_PERSONA_ID=persona-banco
npx prisma db push --skip-generate --accept-data-loss >/dev/null

# El bucket de mentira es el de AHORA (acepta ficheros por flujo) en los dos modos.
npx esbuild "$AQUI/lib/__tests__/grabacion-completa/entrada.ts" --bundle \
  --platform=node --format=esm --outfile="$AQUI/$OUT/entrada.js" \
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
node --test lib/__tests__/grabacion-completa-db.test.mjs

# ── 3. La sala en Chromium ──────────────────────────────────────────────────
node --test lib/__tests__/sala-que-termina.test.mjs
echo "── banco de la grabación completa y el «Salir»: OK (MODO=$MODO) ──"
