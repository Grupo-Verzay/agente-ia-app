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
#  - El ALCANCE del selector y la cuenta recordada
#    (`embudos-alcance-db.test.mjs`): la propia y las que cuelgan de ella, nunca
#    la cartera; y el tablero abre donde se quedó.
#
# Y otra vez con la forma vieja (`MODO=roto`), que son TRES «antes» distintos
# porque son tres fallos distintos, cada uno pinchado a su commit: las acciones
# de etiquetas y respuestas rápidas (ANTES_REF), el tablero de cuando no había
# selector (ANTES_DEL_SELECTOR) y el selector de cuando ofrecía la plataforma
# entera (ANTES_DEL_ALCANCE). En los tres se AFIRMA el fallo.
set -euo pipefail
cd /home/user/agente-ia-app

ANTES_REF="${ANTES_REF:-9a7007d}"
# El «antes» del selector de cuenta y del filtro de asesor: el commit de justo
# antes, NO `origin/main`. En cuanto este cambio se fusione, `origin/main` sería
# el «después» y el modo roto pasaría sin reproducir nada.
ANTES_DEL_SELECTOR="${ANTES_DEL_SELECTOR:-95b56da}"
# Y el «antes» del ALCANCE del selector: cuando ofrecía la cartera entera —en
# una cuenta de la casa, todas las cuentas cliente de la plataforma— y no
# recordaba en qué cuenta se estaba mirando. Otro fallo, otro commit pinchado.
ANTES_DEL_ALCANCE="${ANTES_DEL_ALCANCE:-d1e778c}"

# Y el «antes» de las siete etapas, de las etapas de sistema y del vaciado de
# Perdido: el commit de justo antes. Mismo motivo — `origin/main` sería el
# «después» en cuanto esto se fusione.
ANTES_DE_LAS_SIETE="${ANTES_DE_LAS_SIETE:-d1e778c}"

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
npx esbuild lib/embudos.ts lib/embudos-de-la-cuenta.ts lib/personales.ts lib/etapa-desde-el-chat.ts \
  lib/papelera-de-embudos.ts lib/colores-rapidos.ts --bundle \
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

# El «antes» del ALCANCE: el selector y su cargador tal como estaban. Los dos
# `import` que se apuntan uno a otro llevan su alias; sin ellos resolverían a
# los de hoy —que ya llevan el arreglo— y el modo roto pasaría sin ejercer nada.
ANTES_AL=lib/__tests__/.antes/alcance
mkdir -p "$ANTES_AL"
git show "$ANTES_DEL_ALCANCE:actions/embudos-actions.ts" > "$ANTES_AL/embudos-actions.ts"
git show "$ANTES_DEL_ALCANCE:lib/tablero-de-embudo.server.ts" > "$ANTES_AL/tablero-de-embudo.server.ts"
git show "$ANTES_DEL_ALCANCE:lib/cuentas-de-embudos.server.ts" > "$ANTES_AL/cuentas-de-embudos.server.ts"

empaquetar lib/__tests__/fingido/entrada-de-embudos-alcance.ts

npx esbuild lib/__tests__/fingido/entrada-de-embudos-alcance-antes.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --alias:@/lib/tablero-de-embudo.server=./lib/__tests__/.antes/alcance/tablero-de-embudo.server.ts \
  --alias:@/lib/cuentas-de-embudos.server=./lib/__tests__/.antes/alcance/cuentas-de-embudos.server.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-embudos-alcance-antes.js"

# El «antes» de las siete etapas: sus cuatro ficheros, con los `import` de los
# tres módulos APUNTADOS a los viejos. Sin los alias resolverían a los de hoy
# —que ya llevan el arreglo— y ese fichero pasaría sin ejercer nada.
SIETE=lib/__tests__/.antes/sin-siete/actions
mkdir -p "$SIETE"
for f in actions/embudos-actions.ts lib/embudos.ts lib/embudos-db.ts lib/tablero-de-embudo.server.ts; do
  git show "$ANTES_DE_LAS_SIETE:$f" > "$SIETE/$(basename "$f")"
done
npx esbuild lib/__tests__/fingido/entrada-de-embudos-sin-siete.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --alias:@/lib/embudos=./lib/__tests__/.antes/sin-siete/actions/embudos.ts \
  --alias:@/lib/embudos-db=./lib/__tests__/.antes/sin-siete/actions/embudos-db.ts \
  --alias:@/lib/tablero-de-embudo.server=./lib/__tests__/.antes/sin-siete/actions/tablero-de-embudo.server.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-embudos-sin-siete.js"

node --test lib/__tests__/embudos.test.mjs lib/__tests__/embudos-de-la-cuenta.test.mjs \
     lib/__tests__/embudos-db.test.mjs lib/__tests__/embudos-de-la-cuenta-db.test.mjs \
     lib/__tests__/embudos-alcance-db.test.mjs \
     lib/__tests__/embudos-sin-siete.test.mjs "$@"

echo
echo "── lo personal, con las acciones de $ANTES_REF (tiene que afirmar el fallo) ──"
MODO=roto node --test lib/__tests__/embudos-db.test.mjs

echo
echo "── el tablero, con el de $ANTES_DEL_SELECTOR (tiene que afirmar el fallo) ──"
MODO=roto node --test lib/__tests__/embudos-de-la-cuenta-db.test.mjs

echo
echo "── el alcance del selector, con el de $ANTES_DEL_ALCANCE (tiene que afirmar el fallo) ──"
MODO=roto node --test lib/__tests__/embudos-alcance-db.test.mjs
