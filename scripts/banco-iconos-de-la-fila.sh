#!/usr/bin/env bash
# Los iconos de la fila de Chats (etiquetas, recordatorio, cita, notas,
# seguimientos, flujos…) se ponen al día al cambiarlos desde la conversación
# abierta, sin esperar al reloj de sesiones.
#
# Dos mitades:
#   1. La regla y un barrido del código: cada sitio que cambia un icono avisa
#      a la fila, la pantalla la vuelve a leer, las etiquetas van por el id de
#      la sesión y la lista de notas mira las cuentas de la bandeja.
#   2. La acción de verdad contra Postgres (`laFilaDeLaSesionAction`): lo que
#      se crea se lee al momento, y la puerta no se afloja.
#
# `MODO=roto` lee el código de `ANTES_REF` (un worktree, PINCHADO a un commit,
# nunca origin/main) y afirma el fallo: nadie avisaba y las etiquetas buscaban
# la llave global. La mitad de Postgres se salta ahí y se dice: la acción no
# existía.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
# ffe0583 — antes de esto: los iconos de la fila esperaban al reloj de 60 s.
ANTES_REF="${ANTES_REF:-ffe0583}"
export MODO
RAIZ="$(pwd)"
mkdir -p lib/__tests__/.compilado

if [ "$MODO" = "roto" ]; then
  W="$(mktemp -d)/antes"
  git worktree add -f "$W" "$ANTES_REF" -q
  DIR_ANTES="$W" node --test lib/__tests__/fila-de-chats-al-dia.test.mjs
  git worktree remove --force "$W" >/dev/null 2>&1 || true
  echo "[banco] la mitad de Postgres se salta en modo roto: laFilaDeLaSesionAction no existía."
  exit 0
fi

npx esbuild lib/fila-de-chats-al-dia.ts --bundle --platform=node --format=esm \
  --outdir=lib/__tests__/.compilado --log-level=error
node --test lib/__tests__/fila-de-chats-al-dia.test.mjs

export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgfilaaldia
PORT=55531
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

npx esbuild lib/__tests__/fingido/entrada-de-la-fila-al-dia.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/fila-al-dia \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/fila-al-dia/entrada-de-la-fila-al-dia.js
node --test lib/__tests__/fila-de-chats-al-dia-db.test.mjs
