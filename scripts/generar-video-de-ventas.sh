#!/usr/bin/env bash
# Genera el VÍDEO DE VENTAS (`public/demo/verzay-demo.mp4`) grabando la App de
# verdad: el mismo arranque que las guías (`generar-guia.sh`) —un Postgres de
# usar y tirar, la cuenta de las capturas, `next start` sobre el build— y
# encima el estudio de `scripts/video-de-ventas/`, que siembra la clínica y
# graba la historia mientras el backend de la historia escribe en la base.
#
# Uso:  npm run build && scripts/generar-video-de-ventas.sh
#       SOLO_SERVIR=1 scripts/generar-video-de-ventas.sh   (la App sembrada, sin grabar)
#       ENSAYO=1 scripts/generar-video-de-ventas.sh        (graba, pero deja el vídeo en el directorio de trabajo)
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
export TRABAJO="${TRABAJO:-/tmp/video-de-ventas}"

[ -d .next/static/css ] || { echo "No hay build ('npm run build')." >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "Falta ffmpeg (apt-get install -y ffmpeg)." >&2; exit 1; }

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
# Las columnas que en producción crea el backend y la App lee en crudo: sin
# ellas la bandeja se queda sin fichas (el sello de espera y el de resuelta
# revientan la consulta de sesiones) y el vídeo enseñaría otra pantalla.
psql "$DATABASE_URL" >/dev/null <<'SQL'
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3);
ALTER TABLE "Instancias" ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN DEFAULT true;
SQL
node scripts/sembrar-barra.mjs >/dev/null

# El módulo que mueve una conversación de etapa en la App: el backend de la
# historia lo usa tal cual, así que el embudo lo escribe el mismo código.
OUT=lib/__tests__/.compilado/video-de-ventas
mkdir -p "$OUT"
npx esbuild lib/embudos-db.ts --bundle --platform=node --format=esm --outfile="$OUT/embudos-db.mjs" \
  --external:@prisma/client --external:server-only --log-level=warning
sed -i '/server-only/d' "$OUT/embudos-db.mjs"
export EMBUDOS_DB="$PWD/$OUT/embudos-db.mjs"

LOG=/tmp/video-de-ventas-next.log
setsid npx next start -p "$APP" >"$LOG" 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

if [ "${SOLO_SERVIR:-}" = "1" ]; then
  node scripts/video-de-ventas/sembrar.mjs >/dev/null
  echo "App en http://localhost:$APP (Ctrl+C para parar)"
  wait "$NEXT_PID"
  exit 0
fi

BASE="http://localhost:$APP" node scripts/grabar-video-de-ventas.mjs
