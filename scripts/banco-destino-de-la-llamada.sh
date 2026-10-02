#!/usr/bin/env bash
# Banco de «un contacto sin número se llama y se le escribe por su @lid».
#
# Hay contactos que entran a WhatsApp por su usuario y solo existen como
# `D@lid`. La IA les contestaba bien, pero llamar desde el CRM marcaba sus
# dígitos como un teléfono (+D, el número de nadie), la llamada quedaba anotada
# bajo ese número, la ficha se reescribía con él y, desde ahí, responder a mano
# salía con «El número +D no tiene WhatsApp».
#
# Tres mitades:
#   A. la regla pura (`lib/destino-de-la-llamada.ts`);
#   B. un barrido: los sitios que llaman y el que decide a quién se responde
#      pasan por esa regla y ya no hacen `replace(/\D/g, "")`;
#   C. las acciones de verdad contra Postgres: dónde queda la llamada y qué le
#      pasa a la ficha del contacto.
#
#   scripts/banco-destino-de-la-llamada.sh             la regla de ahora
#   MODO=roto scripts/banco-destino-de-la-llamada.sh   el código de ANTES_REF,
#                                                      y AFIRMA el fallo
set -euo pipefail
cd "$(dirname "$0")/.."

# El «antes», pinchado a un commit: nunca origin/main, que pasa a ser el
# «después» en cuanto esto se fusiona y el modo roto dejaría de ejercer nada.
ANTES_REF="${ANTES_REF:-c65028a}"
export ANTES_REF

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgdestino
PORT=55651

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
# Relleno: el paquete arrastra la validación de entorno del servidor.
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco
# Sin esto `startAstraCall` se rinde en su primera línea y no ejerce nada. El
# `fetch` lo intercepta el propio banco.
export ASTRACALLS_URL=http://localhost:1 ASTRACALLS_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

SALIDA=$PWD/lib/__tests__/.compilado/destino
npx esbuild lib/destino-de-la-llamada.ts --bundle --platform=node --format=esm \
  --outdir="$SALIDA" --log-level=error

empaquetar() { # $1 = árbol, $2 = salida
  (cd "$1" && npx esbuild lib/__tests__/fingido/entrada-del-destino.ts --bundle \
    --platform=node --format=esm --outdir="$2" \
    --external:@prisma/client --external:server-only \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-llamadas.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$2/entrada-del-destino.js"
}

if [ "${MODO:-}" = "roto" ]; then
  ANTES=$PWD/lib/__tests__/.antes/destino
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
  ln -s "$PWD/node_modules" "$ANTES/node_modules"
  cp lib/__tests__/fingido/entrada-del-destino.ts lib/__tests__/fingido/auth-de-llamadas.ts \
     lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-cache.ts \
     "$ANTES/lib/__tests__/fingido/"
  empaquetar "$ANTES" "$PWD/lib/__tests__/.compilado/destino-antes"
  git worktree remove --force "$ANTES"
else
  empaquetar "$PWD" "$SALIDA"
fi

# El puente `@lid` que expande `buildWhatsAppJidCandidates`: la regla de hoy y
# la de ANTES_PUENTE, compiladas de su propio árbol.
ANTES_PUENTE="${ANTES_PUENTE:-a390032}"
export ANTES_PUENTE
PUENTE=$PWD/lib/__tests__/.compilado/puente
rm -rf "$PUENTE"
npx esbuild lib/destino-de-la-llamada.ts lib/whatsapp-jid.ts --bundle --platform=node \
  --format=esm --outdir="$PUENTE/ahora" --log-level=error
VIEJO=$PWD/lib/__tests__/.antes/puente
git worktree remove --force "$VIEJO" 2>/dev/null || rm -rf "$VIEJO"
git worktree add --detach "$VIEJO" "$ANTES_PUENTE" >/dev/null 2>&1
(cd "$VIEJO" && npx esbuild lib/destino-de-la-llamada.ts --bundle --platform=node \
  --format=esm --outdir="$PUENTE/antes" --log-level=error)
git worktree remove --force "$VIEJO"

node --test --test-concurrency=1 lib/__tests__/destino-de-la-llamada.test.mjs \
  lib/__tests__/puente-del-lid.test.mjs "$@"
