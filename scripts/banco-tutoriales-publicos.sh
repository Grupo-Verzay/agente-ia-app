#!/usr/bin/env bash
# «Tutoriales» en el menú de la landing: la vista pública del centro de ayuda.
#
#  1. Sin navegador (`tutoriales-publicos.test.mjs`), en los dos modos: el menú
#     de la landing en sus tres sitios, la ruta abierta en el middleware, y que
#     las páginas pintan los MISMOS componentes con la MISMA fuente que /ayuda.
#     `MODO=roto` lee `ANTES_REF` (pinchado a un commit) y afirma que no había
#     nada de esto.
#  2. La página SERVIDA y sin sesión (`probar-tutoriales-publicos.mjs`), a 1440
#     y 390: se llega desde el menú, las diez categorías con los números de la
#     fuente, el buscador, una categoría y su guía. Solo en modo bueno: el
#     «antes» no tenía página que servir.
#
# Necesita el build (`npm run build`) para la segunda mitad.
set -euo pipefail
cd "$(dirname "$0")/.."

B=/usr/lib/postgresql/16/bin
export PATH="$B:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export ANTES_REF="${ANTES_REF:-3992838}"

C=lib/__tests__/.compilado/tutoriales-publicos
mkdir -p "$C"
for m in centro-de-ayuda guias-del-centro-de-ayuda; do
  npx -y esbuild "lib/$m.ts" --bundle --platform=node --format=esm --outfile="$C/$m.mjs" --log-level=warning
done

echo "── el código, con el cambio ──"
MODO=bueno node --test lib/__tests__/tutoriales-publicos.test.mjs
echo
echo "── el código de ANTES ($ANTES_REF): tiene que afirmar que no había nada ──"
MODO=roto node --test lib/__tests__/tutoriales-publicos.test.mjs

if [ "${MODO:-bueno}" = "roto" ] || [ "${1:-}" = "--solo-puro" ]; then exit 0; fi
if [ ! -d .next/static/css ]; then
  echo "No hay build: para la página servida hace falta 'npm run build'." >&2
  exit 1
fi

PGDIR=/tmp/pgtutoriales
PGPORT=55472
APPPORT=3922
if [ ! -d "$PGDIR/base" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "$B/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "$B/pg_ctl -D $PGDIR -o '-p $PGPORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "$B/createdb -h $PGDIR -p $PGPORT -U postgres banco" 2>/dev/null || true
export DATABASE_URL="postgresql://postgres@localhost:$PGPORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
npx prisma db push --skip-generate --accept-data-loss >/dev/null

# Relleno: la validación de entorno del servidor, que no decide nada de esto.
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APPPORT" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=http://localhost \
       S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx next start -p "$APPPORT" > /tmp/banco-tutoriales-next.log 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do
  if curl -fs -o /dev/null "http://localhost:$APPPORT/tutoriales"; then break; fi
  sleep 1
done

echo
echo "── la página SERVIDA, sin sesión ──"
BASE="http://localhost:$APPPORT" node scripts/probar-tutoriales-publicos.mjs
