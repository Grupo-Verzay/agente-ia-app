#!/usr/bin/env bash
# El detalle de una videollamada con IA (Verzy, Tavus) en CRM › Llamadas:
# grabación, transcripción y resumen.
#
# Tavus no puede grabar en nuestro MinIO, así que graba la SALA del cliente
# (`lib/grabacion-de-videollamada.ts`). Cuatro mitades:
#   1. Las reglas puras: el lienzo, el formato (mp4 de Safari), las llaves.
#   2. La ruta y el cierre contra Postgres con un bucket de mentira: firma,
#      techos, trozos juntados EN ORDEN en partes de ≥5 MiB, y la grabación en
#      `raw.call` de la fila del CRM llegue antes o después que la
#      transcripción.
#   3. La sala MONTADA en Chromium con un Daily de mentira con pistas de
#      verdad: graba sola, sube trozos de audio y de video que se reproducen
#      juntos, dice «Grabando», cierra al colgar, y la de un asesor no graba.
#   4. El diálogo PINTADO en Chromium: «Detalle de la videollamada», el video,
#      la transcripción por turnos y el resumen, sin el «Reintentar» de
#      AstraCalls.
#   (+) Si hay build (`.next`), la ruta se ALCANZA: el middleware no la manda
#      a /login (un 401 de la firma, no un 200 falso).
#
# `MODO=roto` monta la sala y el diálogo de `ANTES_REF` (5983031, pinchado a
# un commit, nunca `origin/main`) y AFIRMA los fallos: la sala no subía ni un
# byte, y el detalle salía como «Detalle de la llamada» sin video.
#
# Uso:  scripts/banco-detalle-de-videollamada.sh
#       MODO=roto scripts/banco-detalle-de-videollamada.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:$(pwd)/node_modules:/opt/node22/lib/node_modules"
export MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-5983031}"
OUT=lib/__tests__/.compilado/grabacion-de-videollamada
mkdir -p "$OUT"

limpiar() {
  [ -n "${ARBOL:-}" ] && git worktree remove --force "$ARBOL" 2>/dev/null || true
  [ -n "${SERVIDOR:-}" ] && kill "$SERVIDOR" 2>/dev/null || true
}
trap limpiar EXIT

if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DEL_ANTES="$ARBOL"
else
  # ── 1. Las reglas puras ───────────────────────────────────────────────────
  npx esbuild lib/grabacion-de-videollamada.ts --bundle --format=esm --platform=node \
    --alias:@="$(pwd)" --outfile="$OUT/puro.js" --log-level=error
  npx esbuild lib/grabacion-de-reunion.ts --bundle --format=esm --platform=node \
    --alias:@="$(pwd)" --outfile="$OUT/reunion.js" --log-level=error
  node --test lib/__tests__/grabacion-de-videollamada.test.mjs

  # ── 2. La ruta y el cierre contra Postgres ────────────────────────────────
  PGDIR=/tmp/pgdetallevideollamada
  PORT=55491
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
  node --test lib/__tests__/grabacion-de-videollamada-db.test.mjs
fi

# ── 3 y 4. La sala y el diálogo en Chromium ─────────────────────────────────
node --test lib/__tests__/sala-que-graba.test.mjs lib/__tests__/detalle-de-videollamada.test.mjs

# ── (+) La ruta se alcanza de verdad (solo con build) ───────────────────────
if [ "$MODO" = "bueno" ] && [ -f .next/BUILD_ID ]; then
  PUERTO=3917
  PORT=$PUERTO HOSTNAME=127.0.0.1 npx next start -p "$PUERTO" >"$OUT/servidor.log" 2>&1 &
  SERVIDOR=$!
  for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$PUERTO/" && break; sleep 1; done
  CODIGO=$(curl -s -o "$OUT/respuesta.json" -w '%{http_code}' -X POST \
    "http://127.0.0.1:$PUERTO/api/videollamada/grabacion?a=empezar&c=cita&f=mala")
  echo "── la ruta se alcanza: $CODIGO $(cat "$OUT/respuesta.json") ──"
  if [ "$CODIGO" != "401" ] || ! grep -q '"motivo":"firma"' "$OUT/respuesta.json"; then
    echo "la ruta NO se alcanza: el middleware la desvía" >&2
    exit 1
  fi
fi
echo "── banco del detalle de la videollamada: OK (MODO=$MODO) ──"
