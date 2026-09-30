#!/usr/bin/env bash
# Respuestas Rápidas (`/auto-replies`): los arreglos de la pantalla. Tres mitades:
#
#   1. Las REGLAS (`lib/respuestas-rapidas.ts`), el plan de la mudanza de las
#      ya creadas (`scripts/mover-respuestas-a-su-cuenta.mjs`) y un BARRIDO del
#      código (`lib/__tests__/respuestas-rapidas-reglas.test.mjs`): Chats ofrece
#      las de flujo, Waha las lanza y el panel de Atajos no esconde las sin atajo.
#   2. Las ACCIONES contra POSTGRES (`lib/__tests__/respuestas-rapidas-db.test.mjs`):
#      lo que crea alguien del equipo nace en la cuenta, una nueva sale la
#      primera, un agente no toca lo de la cuenta, ordenar no mueve lo que no se
#      ve y borrar en bloque pasa por las puertas de cada fila.
#   3. La pantalla SERVIDA la recorre la guía (`scripts/generar-guia-respuestas-rapidas.sh`),
#      con sesión y datos: cada receta pulsa los mandos de verdad —crear de las
#      dos clases, editar sin abrir nada, filtrar, ordenar, la «/» y el rayo de
#      Chats— y se cae si alguno no está o no hace lo que dice.
#
# `MODO=roto` lee y empaqueta el código de `ANTES_RR_REF` —pinchado a un
# commit, nunca `origin/main`, que en cuanto esto se fusione sería el «ahora»—
# y AFIRMA los fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
# ab6b110 — antes de esto: una de flujo no salía en Chats ni por Waha, lo que
# creaba alguien del equipo no lo veía nadie y el orden eran N llamadas.
ANTES_RR_REF="${ANTES_RR_REF:-ab6b110}"
export MODO ANTES_RR_REF

RAIZ="$(pwd)"
OUT="$RAIZ/lib/__tests__/.compilado"
mkdir -p "$OUT/respuestas-rapidas" "$OUT/respuestas-rapidas-db"
ARBOL=""
limpiar() { if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi; }
trap limpiar EXIT

# ── 1. Las reglas y el barrido ───────────────────────────────────────────
if [ "$MODO" != "roto" ]; then
  npx esbuild lib/respuestas-rapidas.ts --bundle --platform=node --format=esm \
    --outdir="$OUT/respuestas-rapidas" --log-level=error
fi
node --test lib/__tests__/respuestas-rapidas-reglas.test.mjs

# ── 2. Las acciones contra Postgres ──────────────────────────────────────
PGDIR=/tmp/pgrr
PORT=55547
if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
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

DESDE="$RAIZ"
if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach "$ARBOL" "$ANTES_RR_REF" >/dev/null
  ln -s "$RAIZ/node_modules" "$ARBOL/node_modules"
  mkdir -p "$ARBOL/lib/__tests__/fingido"
  cp lib/__tests__/fingido/entrada-de-respuestas-rapidas.ts lib/__tests__/fingido/auth-de-documentos.ts \
     lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-cache.ts \
     "$ARBOL/lib/__tests__/fingido/"
  DESDE="$ARBOL"
fi
(cd "$DESDE" && npx esbuild lib/__tests__/fingido/entrada-de-respuestas-rapidas.ts --bundle \
  --platform=node --format=esm --outdir="$OUT/respuestas-rapidas-db" \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error)
sed -i '/server-only/d' "$OUT/respuestas-rapidas-db/entrada-de-respuestas-rapidas.js"
node --test lib/__tests__/respuestas-rapidas-db.test.mjs
