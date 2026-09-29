#!/usr/bin/env bash
# El banco de la guía pública SIMÉTRICA: el orden del índice (vídeo →
# introducción → secciones), las tarjetas de cierre y la introducción editable.
#
#   1. `lib/__tests__/cierre-de-la-guia.test.mjs`: la regla, sin navegador.
#   2. `lib/__tests__/cierre-de-la-guia-db.test.mjs`: la acción contra Postgres
#      (la casa guarda, un cliente no; guardar vacío restaura) — si hay Postgres.
#   3. `probar-guia-simetrica.mjs`: la cuadrícula PINTADA en Chromium sobre el
#      CSS del build, con 1..9 secciones a 390/768/1024/1440 (hace falta build).
#   4. `probar-introduccion-de-la-guia.mjs`: el párrafo de introducción ocupa
#      el ancho entero del contenedor (el del vídeo) a 390..1440 (hace falta
#      build). Su «antes» es ANTES_INTRO_REF, con el `max-w-3xl`.
#
# `MODO=roto` lee y pinta lo de ANTES_REF y afirma el fallo.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export MODO="${MODO:-bueno}" ANTES_REF="${ANTES_REF:-153f64f}"

OUT=lib/__tests__/.compilado/cierre-de-la-guia
mkdir -p "$OUT"
if [ "$MODO" != "roto" ]; then
  npx esbuild lib/cierre-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/cierre.mjs" --log-level=warning
  npx esbuild lib/introduccion-de-la-guia.ts --bundle --platform=node --format=esm --outfile="$OUT/intro.mjs" --log-level=warning
fi
node --test lib/__tests__/cierre-de-la-guia.test.mjs

# 2. La introducción editable, contra Postgres (solo en modo bueno: en el
#    «antes» no existía ninguna acción que ejercer).
if [ "$MODO" != "roto" ] && [ -x /usr/lib/postgresql/16/bin/initdb ]; then
  PGDIR=/tmp/pgguiasimetrica PORT=55541
  if [ ! -d "$PGDIR" ]; then
    mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
    su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
  fi
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
  sleep 2
  su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true
  export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR" DIRECT_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
  export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
         S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco
  npx prisma db push --skip-generate --accept-data-loss >/dev/null
  npx esbuild lib/__tests__/fingido/entrada-de-la-guia-simetrica.ts --bundle --platform=node --format=esm \
    --outdir="$OUT" --external:@prisma/client --external:server-only \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts --log-level=error
  sed -i '/server-only/d' "$OUT/entrada-de-la-guia-simetrica.js"
  node --test lib/__tests__/cierre-de-la-guia-db.test.mjs
else
  echo "(roto, o sin Postgres: se salta la mitad de la base)"
fi

if [ -d .next/static/css ]; then
  node scripts/probar-guia-simetrica.mjs
  node scripts/probar-introduccion-de-la-guia.mjs
else
  echo "(sin build: se salta la mitad del navegador)"
fi
