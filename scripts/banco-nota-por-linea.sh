#!/usr/bin/env bash
# LA NOTA INTERNA SE QUEDA EN SU LÍNEA.
#
# El mismo contacto escribe a dos líneas (Ventas y Atención) y tiene una ficha
# en cada una. La conversación abierta pedía su ficha SOLO por el número, el
# servidor devolvía la de cualquier línea, y una nota escrita en Atención se
# guardaba en la ficha de Ventas: salía en las dos conversaciones y en la vista
# previa de la fila de Ventas.
#
# Tres mitades:
#   1. La regla (`lib/sesion-de-la-conversacion-abierta.ts`) y un barrido del
#      código: que la pantalla PASA por ella.
#   2. El hook de la conversación abierta montado de verdad
#      (react-test-renderer): qué le pregunta al servidor, que vuelve a pedir al
#      cambiar de línea sin volver a montarse, y que una respuesta tardía de la
#      línea anterior no se pinta encima.
#   3. Las acciones de verdad contra Postgres: la nota escrita en Atención sale
#      en SU conversación, en SU fila y en la bandeja, y en Ventas no.
#
# Uso:  scripts/banco-nota-por-linea.sh
#       MODO=roto   lee y monta el código de ANTES_REF y AFIRMA el fallo.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` sería el «ahora» y el modo roto pasaría sin reproducir
# nada.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
MODO="${MODO:-bueno}"
# 97b6d07 — antes de esto: la conversación abierta pedía la ficha sin la línea.
ANTES_REF="${ANTES_REF:-97b6d07}"
export MODO ANTES_REF
mkdir -p lib/__tests__/.compilado/nota-por-linea
trap 'rm -rf lib/__tests__/.antes/nota-por-linea' EXIT

# ── 1. La regla y el barrido ─────────────────────────────────────────────────
for f in sesion-de-la-conversacion-abierta crm-de-la-conversacion-abierta; do
  npx esbuild "lib/$f.ts" --bundle --platform=node --format=esm \
    --outdir=lib/__tests__/.compilado --log-level=error
done
node --test lib/__tests__/nota-por-linea.test.mjs

# ── 2. El hook, montado ──────────────────────────────────────────────────────
ENTRADA=lib/__tests__/fingido/entrada-del-hook-de-la-ficha.ts
if [ "$MODO" = "roto" ]; then
  ANTES=lib/__tests__/.antes/nota-por-linea
  rm -rf "$ANTES"; mkdir -p "$ANTES"
  git show "$ANTES_REF:app/(root)/chats/_components/hooks/useChatSession.ts" >"$ANTES/useChatSession.ts"
  cat >"$ANTES/entrada.ts" <<'TS'
export { useChatSession } from "./useChatSession";
export * as servidor from "../../fingido/ficha-del-chat-de-mentira";
TS
  ENTRADA="$ANTES/entrada.ts"
fi
npx esbuild "$ENTRADA" --bundle --platform=node --format=esm \
  --outfile=lib/__tests__/.compilado/nota-por-linea/hook.js \
  --alias:@="$(pwd)" \
  --alias:@/actions/session-action=./lib/__tests__/fingido/ficha-del-chat-de-mentira.ts \
  --alias:@/actions/registro-action=./lib/__tests__/fingido/ficha-del-chat-de-mentira.ts \
  --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts \
  --external:react --external:react-test-renderer --log-level=error
node --test lib/__tests__/nota-por-linea-hook.test.mjs

# ── 3. Las acciones contra Postgres ──────────────────────────────────────────
PGDIR=/tmp/pgnotaporlinea
PORT=55547
if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
  CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
  S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco
npx prisma db push --skip-generate --accept-data-loss >/dev/null

# Las acciones son las MISMAS en los dos modos: el arreglo es de la pantalla.
# Lo que cambia es la pregunta que se le hace al servidor, y esa la escribe el
# propio test (la de antes, literal, y la de hoy, por la regla).
DB=entrada-de-la-nota-por-linea
OUT=lib/__tests__/.compilado/nota-por-linea
npx esbuild "lib/__tests__/fingido/$DB.ts" --bundle --platform=node --format=esm \
  --outdir="$OUT" --alias:@="$(pwd)" \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-finanzas.ts \
  --alias:@/actions/conversation-intelligence-actions=./lib/__tests__/fingido/intel-muda.ts \
  --alias:@/actions/google-sheets-actions=./lib/__tests__/fingido/intel-muda.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --external:@prisma/client --external:server-only \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error
sed -i '/server-only/d' "$OUT/$DB.js"
node --test lib/__tests__/nota-por-linea-db.test.mjs
