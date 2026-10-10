#!/usr/bin/env bash
# El banco de los ADJUNTOS en las NOTAS INTERNAS de Chats.
#
# Al dejar una nota interna o mencionar a un asesor se puede adjuntar un
# archivo —imagen, video, audio o documento—, igual que en «Crear
# recordatorio». El archivo queda guardado CON la nota y, al abrirla después,
# se ve y se puede descargar.
#
# Tres mitades:
#   1. La REGLA pura (`lib/adjuntos-de-la-nota.ts`: qué direcciones se dejan
#      adjuntar, de qué tipo es cada archivo, qué dice un aviso de una nota que
#      es solo un archivo), la SUBIDA desde el navegador (peso, orden, y soltar
#      lo ya subido si algo falla) y un barrido del código.
#   2. Las ACCIONES contra Postgres: guardar nota y archivos en UNA
#      transacción, abrirla después y que traiga los archivos, que nada que no
#      valga se guarde, que otra cuenta no los lea y que borrar la nota borre
#      sus archivos (filas y bucket).
#   3. La PANTALLA en Chromium sobre el CSS del build, con los componentes de
#      verdad: la burbuja (imagen, video, audio y documento a la vista, con su
#      descarga y su visor) y la caja de escribir en modo nota.
#
# Uso:  scripts/banco-adjuntos-en-notas.sh        (hace falta `npm run build`)
#       SOLO=reglas                               (solo las mitades 1 y 2)
#       MODO=roto                                 corre el código de ANTES_REF y
#                                                 AFIRMA el fallo: la nota no
#                                                 sabía de archivos.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` sería el «ahora» y el modo roto pasaría sin reproducir
# nada. fb40429 — antes de esto una nota era solo texto.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-fb40429}"
export MODO ANTES_REF

OUT=lib/__tests__/.compilado/adjuntos-notas
REGLA_OUT=lib/__tests__/.compilado/adjuntos-de-la-nota
mkdir -p "$OUT" "$REGLA_OUT"
ANTES_DIR=lib/__tests__/.antes/adjuntos-notas
ANTES_PANTALLA=lib/__tests__/.antes/adjuntos-notas-pantalla
trap 'rm -rf "$ANTES_DIR" "$ANTES_PANTALLA"' EXIT

# ── 1. La regla, la subida y el barrido ─────────────────────────────────────
if [ "$MODO" != "roto" ]; then
  npx esbuild lib/adjuntos-de-la-nota.ts lib/subir-adjuntos-de-la-nota.ts --bundle \
    --platform=node --format=esm --outdir="$REGLA_OUT" --log-level=error
fi
node --test lib/__tests__/adjuntos-de-la-nota.test.mjs

# ── 2. Las acciones contra Postgres ─────────────────────────────────────────
PGDIR=/tmp/pgadjuntosnotas
PORT=55731
if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

(
  export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
  export DIRECT_URL="$DATABASE_URL"
  export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
    CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
    S3_ENDPOINT=localhost S3_PUBLIC_URL=https://media.banco.test S3_BUCKET_NAME=verzay-media \
    GEMINI_API_KEY=banco
  npx prisma db push --skip-generate --accept-data-loss >/dev/null

  ENTRADA=entrada-de-los-adjuntos-en-notas
  if [ "$MODO" = "roto" ]; then
    # La acción tal cual estaba: se copia al lado y se usa en lugar de la de hoy.
    rm -rf "$ANTES_DIR"; mkdir -p "$ANTES_DIR/actions"
    git show "$ANTES_REF:actions/internal-notes-actions.ts" >"$ANTES_DIR/actions/internal-notes-actions.ts"
    ENTRADA="$ENTRADA-antes"
  fi

  npx esbuild "lib/__tests__/fingido/$ENTRADA.ts" --bundle --platform=node --format=esm \
    --outdir="$OUT" --alias:@="$(pwd)" \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-finanzas.ts \
    --alias:@/lib/minio=./lib/__tests__/fingido/minio-de-las-notas.ts \
    --alias:@/actions/conversation-intelligence-actions=./lib/__tests__/fingido/intel-muda.ts \
    --alias:@/actions/google-sheets-actions=./lib/__tests__/fingido/intel-muda.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --external:@prisma/client --external:server-only \
    --loader:.tsx=tsx --jsx=automatic \
    --define:process.env.NODE_ENV='"production"' --log-level=error
  sed -i '/server-only/d' "$OUT/$ENTRADA.js"
  node --test --test-concurrency=1 lib/__tests__/adjuntos-de-la-nota-db.test.mjs
)

if [ "${SOLO:-}" = "reglas" ]; then
  echo "[banco] solo la regla y las acciones, como se pidió."
  exit 0
fi

# ── 3. La pantalla, en Chromium y sobre el CSS del build ────────────────────
if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

BURBUJA="app/(root)/chats/_components/InternalNoteBubble.tsx"
CAJA="app/(root)/chats/_components/ChatInputBar.tsx"
if [ "$MODO" = "roto" ]; then
  rm -rf "$ANTES_PANTALLA"; mkdir -p "$ANTES_PANTALLA"
  git show "$ANTES_REF:$BURBUJA" >"$ANTES_PANTALLA/InternalNoteBubble.tsx"
  git show "$ANTES_REF:$CAJA" >"$ANTES_PANTALLA/ChatInputBar.tsx"
  # Sus `./` y `../../` apuntan a las carpetas de hoy: solo cambia lo que se viene a probar.
  sed -i "s#from '\./#from '@/app/(root)/chats/_components/#g; s#from \"\./#from \"@/app/(root)/chats/_components/#g; s#from '\.\./\.\./sessions/#from '@/app/(root)/sessions/#g" \
    "$ANTES_PANTALLA"/*.tsx
  BURBUJA="$ANTES_PANTALLA/InternalNoteBubble.tsx"
  CAJA="$ANTES_PANTALLA/ChatInputBar.tsx"
fi

F=./lib/__tests__/fingido
node scripts/empaquetar-con-acciones-mudas.mjs "$F/adjuntos-de-la-nota-harness.tsx" "$OUT/harness.js" \
  "--alias:componente-de-la-burbuja=./$BURBUJA" \
  "--alias:componente-de-la-caja=./$CAJA" \
  "--alias:next/navigation=$F/guia-tema/next-navigation.ts"

node --test --test-concurrency=1 lib/__tests__/adjuntos-de-la-nota-pantalla.test.mjs
