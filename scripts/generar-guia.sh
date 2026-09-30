#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de un módulo
# (`public/guia/<modulo>/`), a partir de la App de verdad. Lo usan todas las
# guías: `generar-guia-leads.sh` y `generar-guia-catalogo.sh` solo le pasan su
# módulo. Con un lanzador copiado por guía, el día que se afine el arranque
# (la base, las variables, la espera a `next start`) se afinaría en una.
#
#   1. Levanta un Postgres de usar y tirar y siembra datos de ejemplo
#      (`sembrar-barra.mjs` para la cuenta y `sembrar-guia-<modulo>.mjs` para
#      lo de esa pantalla).
#   2. Sirve el build con `next start`.
#   3. `capturar-guia-<modulo>.mjs` entra con sesión, abre la pantalla, sigue
#      las recetas de cada captura, pinta las marcas y graba el vídeo.
#
# Qué imágenes hacen falta lo dice `lib/guia-<modulo>.ts`: se compila y se le
# pasa la lista al script, que se cae si alguna no se tomó.
#
# Uso:  npm run build && scripts/generar-guia.sh <modulo>
#       SIN_VIDEO=1 scripts/generar-guia.sh <modulo>   (solo capturas)
#       SOLO_VIDEO=1 scripts/generar-guia.sh <modulo>  (solo el vídeo: p. ej. al cambiar la narración)
#       SOLO_SERVIR=1 scripts/generar-guia.sh <modulo> (la App sembrada, sin capturar)
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
set -euo pipefail
cd "$(dirname "$0")/.."

MODULO="${1:?Uso: scripts/generar-guia.sh <modulo>   (leads, catalogo…)}"
for f in "scripts/sembrar-guia-$MODULO.mjs" "scripts/capturar-guia-$MODULO.mjs" "lib/guia-$MODULO.ts"; do
  [ -f "$f" ] || { echo "No existe $f: ¿es «$MODULO» una guía?" >&2; exit 1; }
done

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
# El vídeo pega la narración con ffmpeg: sin él se caería al FINAL, después de
# todas las capturas. Mejor decirlo antes de empezar.
if [ "${SIN_VIDEO:-}" != "1" ] && [ "${SOLO_MINIATURAS:-}" != "1" ] && ! command -v ffmpeg >/dev/null; then
  echo "Falta ffmpeg, que hace falta para el vídeo (apt-get install -y ffmpeg). O SIN_VIDEO=1." >&2
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
# El correo de la cuenta de servicio que enseña Google Sheets (paso 1 de
# vincular). Uno de EJEMPLO: la guía es pública y el de verdad no se publica.
export GOOGLE_SERVICE_ACCOUNT_JSON='{"client_email":"hojas@plataforma-ejemplo.iam.gserviceaccount.com"}'

npx prisma db push --skip-generate --accept-data-loss >/dev/null
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null
node scripts/sembrar-barra.mjs >/dev/null
node "scripts/sembrar-guia-$MODULO.mjs"

# La lista de capturas que la guía enseña, sacada del propio contenido.
OUT="lib/__tests__/.compilado/guia-$MODULO"
mkdir -p "$OUT"
npx esbuild "lib/guia-$MODULO.ts" --bundle --platform=node --format=esm --outfile="$OUT/guia-$MODULO.mjs" --log-level=warning
export CAPTURAS_ESPERADAS="$(node -e "import('./$OUT/guia-$MODULO.mjs').then(m=>console.log(JSON.stringify(m.lasCapturasQueSeEnsenan())))")"

LOG=/tmp/guia-next.log
# Lo que una pantalla le pide a un servicio de FUERA —Gemini, en AI Imágenes;
# las hojas de Google que importa Mis datos— lo contesta un doble cargado
# DENTRO del proceso de `next start` (`fingido-guia-<modulo>.mjs`): la guía no
# depende de la red, ni de la clave de nadie, ni de una hoja que alguien puede
# borrar. Solo para `next start`: el guion de capturas no lo lleva.
NODE_DEL_SERVIDOR="${NODE_OPTIONS:-}"
if [ -f "scripts/fingido-guia-$MODULO.mjs" ]; then
  NODE_DEL_SERVIDOR="$NODE_DEL_SERVIDOR --import $PWD/scripts/fingido-guia-$MODULO.mjs"
fi
NODE_OPTIONS="$NODE_DEL_SERVIDOR" setsid npx next start -p "$APP" >"$LOG" 2>&1 </dev/null &
NEXT_PID=$!
trap 'kill -- -$NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

# SOLO_SERVIR=1 deja la App servida sobre la semilla, sin capturar: sirve para
# mirar la pantalla al escribir una receta nueva.
if [ "${SOLO_SERVIR:-}" = "1" ]; then
  echo "App en http://localhost:$APP (Ctrl+C para parar)"
  wait "$NEXT_PID"
  exit 0
fi

# `CAPTURAR` cambia QUÉ se toma sobre esta misma App sembrada: lo usa
# `regenerar-barra-de-las-guias.sh`, que rehace solo la barra de arriba de
# todas las guías sin volver a generar ninguna entera.
BASE="http://localhost:$APP" node "${CAPTURAR:-scripts/capturar-guia-$MODULO.mjs}"
