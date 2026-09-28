#!/usr/bin/env bash
# La campana: nueve pastillas en tres grupos de tres, y las tres clases nuevas
# —Correos, Asignaciones y Créditos bajos—.
#
# Tres mitades:
#   1. La regla pura (`campana.test.mjs`): el orden, los conteos, qué aviso de
#      créditos se enseña y cuándo se asigna o se quita un chat.
#   2. La ACCIÓN de verdad contra Postgres (`campana-db.test.mjs`), con solo
#      `currentUser()` fingido: el registro de asignaciones y los avisos que el
#      motor apuntó en `ia_credit_alerts`.
#   3. La campana de VERDAD en Chromium sobre el CSS del build
#      (`campana-navegador.test.mjs`): las nueve pastillas en su sitio, del
#      mismo tamaño, y ningún rótulo recortado, a 1440/1280/1024/390.
#
# `MODO=roto` corre todo contra `ANTES_REF` —pinchado a un commit, nunca a
# `origin/main`— y AFIRMA el fallo: seis pastillas y ninguna de las nuevas.
#
# Necesita el build (`npm run build`) para el CSS.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO
# 97ae916 — antes de esto: seis pastillas, sin Correos, Asignaciones ni Créditos bajos.
ANTES_REF="${ANTES_REF:-97ae916}"
export ANTES_REF

OUT=lib/__tests__/.compilado/campana
ANTES=lib/__tests__/.antes/campana
mkdir -p "$OUT" "$ANTES"
npx -y esbuild lib/campana.ts --format=esm --outfile=$OUT/campana.js --log-level=error

# ── Postgres ────────────────────────────────────────────────────────────────
PGDIR=/tmp/pgcampana
PORT=55631
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

NODO=(--bundle --platform=node --format=esm --outdir=$OUT
  --external:@prisma/client --external:server-only
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts
  --alias:react=./lib/__tests__/fingido/react-cache.ts
  "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);"
  --log-level=error)
if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:actions/notification-center-actions.ts" > "$ANTES/notification-center-actions.ts"
  sed 's#@/actions/notification-center-actions#@/lib/__tests__/.antes/campana/notification-center-actions#' \
    lib/__tests__/fingido/entrada-de-la-campana.ts > "$ANTES/antes-de-la-campana.ts"
  sed -i 's#"\./auth-de-documentos"#"@/lib/__tests__/fingido/auth-de-documentos"#' "$ANTES/antes-de-la-campana.ts"
  npx esbuild "$ANTES/antes-de-la-campana.ts" "${NODO[@]}"
  sed -i '/server-only/d' $OUT/antes-de-la-campana.js
else
  npx esbuild lib/__tests__/fingido/entrada-de-la-campana.ts "${NODO[@]}"
  sed -i '/server-only/d' $OUT/entrada-de-la-campana.js
fi

# ── Navegador ───────────────────────────────────────────────────────────────
NAV=(
  --alias:@/actions/notification-center-actions=./lib/__tests__/fingido/campana/notificaciones.ts
  --alias:@/actions/collab-actions=./lib/__tests__/fingido/campana/colaboracion.ts
  --alias:@/actions/correo-actions=./lib/__tests__/fingido/campana/correos.ts
)
if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:components/shared/NotificationCenter.tsx" > "$ANTES/NotificationCenter.tsx"
  git show "$ANTES_REF:lib/campana.ts" > "$ANTES/campana.ts"
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/campana/entrada.tsx $OUT/navegador-antes.js "${NAV[@]}" \
    "--alias:@/components/shared/NotificationCenter=./$ANTES/NotificationCenter.tsx" \
    "--alias:@/lib/campana=./$ANTES/campana.ts"
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/campana/entrada.tsx $OUT/navegador.js "${NAV[@]}"
fi

node --test --test-concurrency=1 \
  lib/__tests__/campana.test.mjs lib/__tests__/campana-db.test.mjs lib/__tests__/campana-navegador.test.mjs
