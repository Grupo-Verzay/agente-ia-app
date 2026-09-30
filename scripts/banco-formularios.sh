#!/usr/bin/env bash
# MIS FORMULARIOS: lo que se arregló al documentar la pantalla.
#
#   - el formulario público (/f/...) y su subida de archivos mandaban al login;
#   - la pantalla pedía un rol que el equipo no tiene, y las acciones iban con
#     la persona y no con la cuenta;
#   - la variable de WhatsApp se sustituía con una expresión regular armada con
#     la pregunta (con «¿…?» no casaba nunca);
#   - la pestaña de Google Sheets se buscaba letra a letra y cada registro de
#     «PROCESO DE ATENCION» quedaba en Error (3 así en producción);
#   - el envío público guardaba cualquier clave, también a un formulario
#     desactivado, y la página pública llevaba la hoja de Google dentro.
#
# Dos mitades:
#   1. Las REGLAS (`lib/formularios.ts`) y un BARRIDO del código.
#   2. Las ACCIONES de verdad contra POSTGRES, con Google Sheets de mentira.
#
# `MODO=roto` lee y empaqueta el código de `ANTES_REF` —pinchado a un commit,
# nunca `origin/main`, que en cuanto esto se fusione sería el «ahora»— y
# AFIRMA los fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"

MODO="${MODO:-bueno}"
export MODO
# ab6b110 — antes de esto: el formulario público pedía sesión y lo demás de arriba.
ANTES_REF="${ANTES_REF:-ab6b110}"
export ANTES_REF

RAIZ="$(pwd)"
OUT="$RAIZ/lib/__tests__/.compilado/formularios"
mkdir -p "$OUT"

ARBOL=""
limpiar() {
  if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi
}
trap limpiar EXIT

# ── 1. Las reglas y el barrido ───────────────────────────────────────────
npx esbuild lib/formularios.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --log-level=error
node --test lib/__tests__/formularios-reglas.test.mjs

# ── 2. Las acciones contra Postgres ──────────────────────────────────────
PGDIR=/tmp/pgformularios
PORT=55541
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
export S3_BUCKET_NAME=verzay-media
export GOOGLE_SERVICE_ACCOUNT_JSON='{"client_email":"hoja@banco.iam.gserviceaccount.com"}'
export GOOGLE_SHEETS_CREDENTIALS="$GOOGLE_SERVICE_ACCOUNT_JSON"
npx prisma db push --skip-generate --accept-data-loss >/dev/null

DONDE="$RAIZ"
if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach "$ARBOL" "$ANTES_REF" >/dev/null
  ln -s "$RAIZ/node_modules" "$ARBOL/node_modules"
  mkdir -p "$ARBOL/lib/__tests__/fingido"
  for f in entrada-de-formularios.ts googleapis-de-formularios.ts auth-de-documentos.ts next-cache.ts react-cache.ts; do
    cp "lib/__tests__/fingido/$f" "$ARBOL/lib/__tests__/fingido/"
  done
  DONDE="$ARBOL"
fi

(cd "$DONDE" && npx esbuild lib/__tests__/fingido/entrada-de-formularios.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:googleapis=./lib/__tests__/fingido/googleapis-de-formularios.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error)
sed -i '/server-only/d' "$OUT/entrada-de-formularios.js"
node --test lib/__tests__/formularios-db.test.mjs "$@"
