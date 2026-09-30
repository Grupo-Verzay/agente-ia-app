#!/usr/bin/env bash
# El banco de la pantalla de Mis macros.
#
# Dos mitades:
#
#  - **Las reglas y un barrido del código** (`macros.test.mjs`), sin base: qué
#    le falta a cada acción, por qué proveedor sale lo que envía, qué dice el
#    aviso al correrla y qué enseña la lista; y que la pantalla, el menú del
#    chat y la acción USAN esas reglas.
#  - **Las ACCIONES contra Postgres** (`macros-db.test.mjs`): una madre con una
#    línea de cada proveedor, una hija vinculada y una cuenta ajena. Lo único
#    que se finge son las ocho acciones que la macro llama por dentro, que se
#    APUNTAN para poder afirmar por cuál salió cada cosa.
#
# Y las dos corren además en `MODO=roto`, contra `ANTES_REF` —pinchado a un
# commit, nunca `origin/main`, que pasa a ser el «ahora» en cuanto esto se
# fusione—, y AFIRMAN el fallo: en una línea de WhatsApp Mensajería no salía
# nada y el aviso decía «Macro aplicada.», una acción a medias o un envío
# rechazado contaban como hechos, y la lista escribía «acciónes».
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
ANTES_REF="${ANTES_REF:-ab6b110}"
export ANTES_MACROS_REF="$ANTES_REF"

PGDIR=/tmp/pgmacros
PORT=55512
if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

OUT=lib/__tests__/.compilado/macros
mkdir -p "$OUT"
npx esbuild lib/macros.ts --bundle --platform=node --format=esm \
  --outfile="$OUT/macros.mjs" --alias:@="$(pwd)" --log-level=error

# El «antes»: las acciones de las macros de ANTES_REF, con sus `./` apuntados a
# las de hoy (las que se fingen son las mismas en los dos).
ANTES_DIR=lib/__tests__/.antes/macros
trap 'rm -rf "$ANTES_DIR"' EXIT
mkdir -p "$ANTES_DIR/actions"
git show "$ANTES_REF:actions/macro-actions.ts" \
  | sed "s#from '\./#from '@/actions/#g; s#from \"\./#from \"@/actions/#g" > "$ANTES_DIR/actions/macro-actions.ts"

FINGIDA=./lib/__tests__/fingido/acciones-de-macros.ts
for ENTRADA in entrada-de-macros entrada-de-macros-antes; do
  npx esbuild "lib/__tests__/fingido/$ENTRADA.ts" --bundle \
    --platform=node --format=esm --outfile="$OUT/$ENTRADA.js" \
    --alias:@="$(pwd)" \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:@/actions/chat-manual-actions=$FINGIDA \
    --alias:@/actions/channel-chat-actions=$FINGIDA \
    --alias:@/actions/waha-chat-actions=$FINGIDA \
    --alias:@/actions/tag-actions=$FINGIDA \
    --alias:@/actions/session-action=$FINGIDA \
    --alias:@/actions/advisor-assign-actions=$FINGIDA \
    --alias:@/actions/internal-notes-actions=$FINGIDA \
    --alias:@/actions/task-actions=$FINGIDA \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --external:@prisma/client --external:server-only \
    --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" \
    --log-level=error
  sed -i '/server-only/d' "$OUT/$ENTRADA.js"
done

node --test --test-concurrency=1 lib/__tests__/macros.test.mjs lib/__tests__/macros-db.test.mjs "$@"

echo
echo "── Mis macros, con la forma VIEJA (tiene que afirmar el fallo) ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/macros.test.mjs lib/__tests__/macros-db.test.mjs
