#!/usr/bin/env bash
# El banco del reparto POR PORCENTAJE de la auto-asignación (lado de la App:
# quien lo CONFIGURA en Equipo y quien reparte con «Asignar sin atender»).
#
#  - la regla pura, que la regla es la MISMA que la del backend (byte a byte) y
#    un barrido de la pantalla (`reparto-por-porcentaje.test.mjs`);
#  - las ACCIONES de verdad contra Postgres (`reparto-por-porcentaje-db.test.mjs`):
#    la suma que no es 100 no se guarda, 50/30/20 reparte exacto, cambiar un
#    porcentaje no reinicia el contador, un asesor desactivado se salta sin
#    perder su historial, los modos son excluyentes y un agente no configura.
#
# Quien reparte los chats que ENTRAN es el backend: su banco es
# `api-webhook/scripts/banco-reparto-por-porcentaje.sh`.
#
# Y corre además con la pantalla de ANTES (`MODO=roto`, `git show ANTES_REF`),
# donde se AFIRMA que no había tercer modo.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANTES_REF="${ANTES_REF:-d2783ea}"
export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgrepartoapp
PORT=55494

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
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

OUT=lib/__tests__/.compilado/reparto
mkdir -p "$OUT"

npx esbuild lib/reparto-por-porcentaje.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" --log-level=error

npx esbuild lib/__tests__/fingido/entrada-del-reparto-por-porcentaje.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" --packages=external \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-del-reparto-por-porcentaje.js"

node --test lib/__tests__/reparto-por-porcentaje.test.mjs \
            lib/__tests__/reparto-por-porcentaje-db.test.mjs "$@"

echo
echo "── con la pantalla de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/reparto-por-porcentaje.test.mjs \
                      lib/__tests__/reparto-por-porcentaje-db.test.mjs "$@"
