#!/usr/bin/env bash
# El banco de la PANTALLA de Copiloto (`/copiloto`) y de las INTEGRACIONES que
# «Fijar en Chats» escribe: lo que se arregló al documentarla.
#
# Tres mitades, porque el cambio vive en tres capas:
#
#   1. Las REGLAS, puras (`lib/copiloto.ts`, `lib/url-embebible.ts`): qué
#      dirección se abre, dónde van los dos botones según el ancho del copiloto
#      y cuándo se ofrece la pantalla completa.
#   2. Un BARRIDO del código: que la pantalla, el marco, la lista de
#      Integraciones y sus acciones pasen por esas reglas.
#   3. Las ACCIONES de las integraciones contra POSTGRES, y la pantalla REAL en
#      CHROMIUM con el copiloto de verdad dentro del marco (el LibreChat local
#      de `scripts/copiloto-de-la-guia.sh`, la misma versión que producción).
#      Lo primero es lo único que dice que ya no se guarda `javascript:` ni se
#      mueve una fila de cuenta al editarla; lo segundo, lo único que dice si
#      los botones tapan alguno del copiloto: su cabecera no es nuestra y cambia
#      con su ancho, así que se MIDE.
#
# `MODO=roto` monta el «antes» y AFIRMA los fallos: `?u=javascript:` llegando
# al marco y corriendo en la plataforma, los botones encima de los del
# copiloto, y las acciones guardando `javascript:` y regalando la fila.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` pasa a ser el «ahora» y el modo roto se pondría verde
# sin ejercer nada.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-ab6b110}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

# El copiloto de verdad, dentro del marco. Sin él el banco no mide los botones
# (lo dice y se salta ese caso): se levanta aquí si no está.
if ! curl -s -o /dev/null -f "${COPILOTO_LOCAL:-http://localhost:3080}/login"; then
  scripts/copiloto-de-la-guia.sh
fi

mkdir -p lib/__tests__/.compilado

# ─────────────────────────────────────────────────────────────────────────────
# 1 y 2. Las reglas puras (el barrido lee los ficheros con `fs`, sin compilar)
# ─────────────────────────────────────────────────────────────────────────────
npx esbuild lib/copiloto.ts lib/url-embebible.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/copiloto \
  --alias:@/lib/url-embebible=./lib/url-embebible.ts \
  --log-level=error

# ─────────────────────────────────────────────────────────────────────────────
# 3a. Las acciones de las integraciones contra Postgres
# ─────────────────────────────────────────────────────────────────────────────
PGDIR=/tmp/pgcopiloto
PORT=55499

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

ACCIONES_ANTES="actions/.user-integration-actions-antes.ts"
MAIN_ANTES="app/(root)/copiloto/_components/.MainCopiloto-antes.tsx"
MARCO_ANTES="components/custom/.IframeRenderer-antes.tsx"
ENTRY=".banco-copiloto-entry.tsx"
trap 'rm -f "$ACCIONES_ANTES" "$MAIN_ANTES" "$MARCO_ANTES" "$ENTRY"' EXIT

ALIAS_ACCIONES=()
if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:actions/user-integration-actions.ts" > "$ACCIONES_ANTES"
  ALIAS_ACCIONES=(--alias:@/actions/user-integration-actions=./$ACCIONES_ANTES)
fi

OUT=lib/__tests__/.compilado/integraciones
npx esbuild lib/__tests__/fingido/entrada-de-las-integraciones.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  "${ALIAS_ACCIONES[@]}" \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-las-integraciones.js"

# ─────────────────────────────────────────────────────────────────────────────
# 3b. La pantalla REAL, con `?u=` leído de la dirección de la página
# ─────────────────────────────────────────────────────────────────────────────
PANTALLA="@/app/(root)/copiloto/_components/MainCopiloto"
if [ "$MODO" = "roto" ]; then
  # Cada fichero del «antes» junto a sus vecinos de hoy, para que sus rutas
  # resuelvan; lo único que se reescribe es el import del marco. Sin ese
  # alias, la pantalla vieja cargaría el marco de HOY —que ya sanea la
  # dirección— y el modo roto no reproduciría nada.
  git show "$ANTES_REF:components/custom/IframeRenderer.tsx" > "$MARCO_ANTES"
  git show "$ANTES_REF:app/(root)/copiloto/_components/MainCopiloto.tsx" \
    | sed 's#@/components/custom/IframeRenderer#@/components/custom/.IframeRenderer-antes#' \
    > "$MAIN_ANTES"
  PANTALLA="@/app/(root)/copiloto/_components/.MainCopiloto-antes"
fi

cat > "$ENTRY" <<'TSX'
import React from "react";
import { createRoot } from "react-dom/client";
import { MainCopiloto } from "__PANTALLA__";

(window as any).maqueta = () => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("app")!));
    raiz.render(<MainCopiloto />);
};
(window as any).listo = true;
TSX
sed -i "s#__PANTALLA__#${PANTALLA}#" "$ENTRY"

node scripts/empaquetar-con-acciones-mudas.mjs "$ENTRY" lib/__tests__/.compilado/harness-copiloto.js \
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-de-la-url.ts

rm -f "$ACCIONES_ANTES" "$MAIN_ANTES" "$MARCO_ANTES" "$ENTRY"

node --test lib/__tests__/copiloto.test.mjs lib/__tests__/integraciones-db.test.mjs "$@"
