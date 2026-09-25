#!/usr/bin/env bash
# El banco de Embudos y de las etiquetas y respuestas rápidas personales.
#
# Dos mitades:
#  - Las reglas, puras (`embudos.test.mjs`): de qué embudo es cada
#    conversación, qué embudo abre cada uno, quién mueve qué, los colores, y
#    quién ve lo personal.
#  - Las ACCIONES contra Postgres con el esquema real (`embudos-db.test.mjs`):
#    dueño, administradora, dos agentes y una cuenta ajena.
#
# Y otra vez con la forma vieja (`MODO=roto`): las acciones de etiquetas y
# respuestas rápidas de ANTES_REF, sacadas con `git show`. Ahí se AFIRMA el
# fallo — el compañero veía, pisaba y borraba lo del otro. Embudos no tiene
# «antes» (no existía) y esa parte se salta diciéndolo.
set -euo pipefail
cd /home/user/agente-ia-app

ANTES_REF="${ANTES_REF:-9a7007d}"
# El «antes» del selector de cuenta y del filtro de asesor: el commit de justo
# antes, NO `origin/main`. En cuanto este cambio se fusione, `origin/main` sería
# el «después» y el modo roto pasaría sin reproducir nada.
ANTES_DEL_SELECTOR="${ANTES_DEL_SELECTOR:-95b56da}"

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgembudos
PORT=55493

if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
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

OUT=lib/__tests__/.compilado/embudos
npx esbuild lib/embudos.ts lib/embudos-de-la-cuenta.ts lib/personales.ts lib/etapa-desde-el-chat.ts --bundle \
  --platform=node --format=esm --outdir=$OUT --log-level=error

empaquetar() {
  npx esbuild "$1" --bundle \
    --platform=node --format=esm --outdir=$OUT \
    --external:@prisma/client --external:server-only \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --log-level=error
  sed -i '/server-only/d' "$OUT/$(basename "${1%.ts}").js"
}
empaquetar lib/__tests__/fingido/entrada-de-embudos.ts

# El «antes» de lo personal: los dos ficheros de acciones tal como estaban.
ANTES=lib/__tests__/.antes/embudos/actions
mkdir -p "$ANTES"
git show "$ANTES_REF:actions/tag-actions.ts" > "$ANTES/tag-actions.ts"
git show "$ANTES_REF:actions/rr-actions.ts" > "$ANTES/rr-actions.ts"
empaquetar lib/__tests__/fingido/entrada-de-lo-personal-antes.ts

# El «antes» del tablero de otra cuenta: las acciones y el cargador de
# ANTES_DEL_SELECTOR. El `import` del cargador se APUNTA al viejo: sin el alias
# resolvería al de hoy —que ya lleva el arreglo— y el modo roto pasaría sin
# ejercer nada.
git show "$ANTES_DEL_SELECTOR:actions/embudos-actions.ts" > "$ANTES/embudos-actions.ts"
git show "$ANTES_DEL_SELECTOR:lib/tablero-de-embudo.server.ts" > "$ANTES/tablero-de-embudo.server.ts"
npx esbuild lib/__tests__/fingido/entrada-de-embudos-antes.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --alias:@/lib/tablero-de-embudo.server=./lib/__tests__/.antes/embudos/actions/tablero-de-embudo.server.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-embudos-antes.js"

node --test lib/__tests__/embudos.test.mjs lib/__tests__/embudos-de-la-cuenta.test.mjs \
     lib/__tests__/embudos-db.test.mjs lib/__tests__/embudos-de-la-cuenta-db.test.mjs "$@"

echo
echo "── lo personal, con las acciones de $ANTES_REF (tiene que afirmar el fallo) ──"
MODO=roto node --test lib/__tests__/embudos-db.test.mjs

echo
echo "── el tablero, con el de $ANTES_DEL_SELECTOR (tiene que afirmar el fallo) ──"
MODO=roto node --test lib/__tests__/embudos-de-la-cuenta-db.test.mjs
