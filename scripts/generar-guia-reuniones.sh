#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de Reuniones
# (`public/guia/reuniones/`), a partir de la App de verdad. Mismo camino que
# `generar-guia-leads.sh`:
#
#   1. Levanta un Postgres de usar y tirar y siembra la cuenta
#      (`sembrar-barra.mjs`), el marco de un cliente (`sembrar-guia-leads.mjs`:
#      el menú y la barra de arriba son los mismos en todas las guías) y las
#      reuniones de ejemplo (`sembrar-guia-reuniones.mjs`).
#   2. Sirve el build con `next start`.
#   3. `capturar-guia-reuniones.mjs` abre `/reuniones` con TRES navegadores
#      —la anfitriona, alguien del equipo y un invitado de fuera—, cada uno con
#      su cámara y su micrófono de mentira (`camaras-de-la-guia.mjs`), sigue
#      las recetas de cada captura, pinta las marcas y graba el vídeo.
#
# Qué imágenes hacen falta lo dice `lib/guia-reuniones.ts`: se compila y se le
# pasa la lista al script, que se cae si alguna no se tomó.
#
# Uso:  npm run build && scripts/generar-guia-reuniones.sh
#       SIN_VIDEO=1 scripts/generar-guia-reuniones.sh   (solo capturas)
#       SOLO_VIDEO=1 scripts/generar-guia-reuniones.sh  (solo el vídeo)
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
# Los ficheros de las grabaciones de ejemplo: los sirve el script de capturas
# en esta dirección, que es la que la App cree que es su almacenamiento.
PUBLICO_PORT=9000

if [ ! -d .next/static/css ]; then
  echo "No hay build ('npm run build')." >&2
  exit 1
fi
# Las cámaras de mentira y el vídeo se hacen con ffmpeg: sin él se caería a
# mitad, después de varias capturas. Mejor decirlo antes de empezar.
if ! command -v ffmpeg >/dev/null; then
  echo "Falta ffmpeg, que hace falta para las cámaras de ejemplo y el vídeo (apt-get install -y ffmpeg)." >&2
  exit 1
fi
if [ ! -d public/segmentacion ]; then
  echo "Falta public/segmentacion (el fondo de la reunión): se copia al construir ('npm run build')." >&2
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
       S3_PUBLIC_URL="http://localhost:$PUBLICO_PORT" GEMINI_API_KEY=banco \
       NEXT_TELEMETRY_DISABLED=1

npx prisma db push --skip-generate --accept-data-loss >/dev/null
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null
node scripts/sembrar-barra.mjs >/dev/null
node scripts/sembrar-guia-leads.mjs >/dev/null

# Las reuniones las siembra el propio módulo de la App, compilado: así las
# tablas son las de producción y no una copia de su esquema.
OUT=lib/__tests__/.compilado/guia-reuniones
mkdir -p "$OUT"
npx esbuild lib/salas-de-video-db.ts --bundle --platform=node --format=esm \
  --outfile="$OUT/salas-de-video-db.js" \
  --external:@prisma/client --external:server-only --log-level=error
sed -i '/^import "server-only";$/d' "$OUT/salas-de-video-db.js"
export SALAS_DB="$PWD/$OUT/salas-de-video-db.js"
# Con la zona del NAVEGADOR de las capturas: la semilla dice «a las 10:00» con
# `setHours`, que usa la zona del proceso, y en el contenedor esa es UTC — las
# reuniones de la mañana salían a las 5:00.
TZ=America/Bogota node scripts/sembrar-guia-reuniones.mjs

# La lista de capturas que la guía enseña, sacada del propio contenido.
npx esbuild lib/guia-reuniones.ts --bundle --platform=node --format=esm --outfile="$OUT/guia-reuniones.mjs" --log-level=warning
export CAPTURAS_ESPERADAS="$(node -e "import('./$OUT/guia-reuniones.mjs').then(m=>console.log(JSON.stringify(m.lasCapturasQueSeEnsenan())))")"

LOG=/tmp/guia-next.log
setsid npx next start -p "$APP" >"$LOG" 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

BASE="http://localhost:$APP" PUBLICO_PORT="$PUBLICO_PORT" node scripts/capturar-guia-reuniones.mjs
