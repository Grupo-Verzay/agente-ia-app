#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de Leads
# (`public/guia/leads/`), a partir de la App de verdad.
#
#   1. Levanta un Postgres de usar y tirar y siembra datos de ejemplo
#      (`sembrar-barra.mjs` para la cuenta y `sembrar-guia-leads.mjs` para los
#      contactos).
#   2. Sirve el build con `next start`.
#   3. `capturar-guia-leads.mjs` entra con sesión, abre `/sessions`, sigue las
#      recetas de cada captura, pinta las marcas y graba el vídeo.
#
# Qué imágenes hacen falta lo dice `lib/guia-leads.ts`: se compila y se le
# pasa la lista al script, que se cae si alguna no se tomó.
#
# Uso:  npm run build && scripts/generar-guia-leads.sh
#       SIN_VIDEO=1 scripts/generar-guia-leads.sh   (solo capturas)
#       SOLO_VIDEO=1 scripts/generar-guia-leads.sh  (solo el vídeo: p. ej. al cambiar la narración)
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

PGDIR=/tmp/pgguia
PORT=55491
APP="${APP:-3940}"

if [ ! -d .next/static/css ]; then
  echo "No hay build ('npm run build')." >&2
  exit 1
fi

if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "dropdb --force -h $PGDIR -p $PORT -U postgres guia" 2>/dev/null || true
su postgres -c "createdb -h $PGDIR -p $PORT -U postgres guia"

export DATABASE_URL="postgresql://postgres@localhost:$PORT/guia?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost \
       S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco \
       NEXT_TELEMETRY_DISABLED=1

npx prisma db push --skip-generate --accept-data-loss >/dev/null
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null
node scripts/sembrar-barra.mjs >/dev/null
node scripts/sembrar-guia-leads.mjs

# La lista de capturas que la guía enseña, sacada del propio contenido.
OUT=lib/__tests__/.compilado/guia-leads
mkdir -p "$OUT"
npx esbuild lib/guia-leads.ts --bundle --platform=node --format=esm --outfile="$OUT/guia-leads.mjs" --log-level=warning
export CAPTURAS_ESPERADAS="$(node -e "import('./$OUT/guia-leads.mjs').then(m=>console.log(JSON.stringify(m.lasCapturasQueSeEnsenan())))")"

LOG=/tmp/guia-next.log
setsid npx next start -p "$APP" >"$LOG" 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

BASE="http://localhost:$APP" node scripts/capturar-guia-leads.mjs
