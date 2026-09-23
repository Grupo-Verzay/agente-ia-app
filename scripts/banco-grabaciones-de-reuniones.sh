#!/usr/bin/env bash
# Reuniones › Grabaciones: su propia pestaña, una miniatura por fila y ampliar.
#
# Tres mitades:
#   1. La decisión, pura (`lib/grabaciones-de-la-pantalla.ts`): la lista plana
#      con el título de su reunión, la más reciente arriba, y el filtro de
#      alcance fila a fila.
#   2. Las ACCIONES contra Postgres (`lasGrabacionesDeLasReunionesAction` y
#      `transcribirLaReunionAction`), con `linked_accounts` sembrada: la madre
#      ve lo suyo y lo de sus hijas; una hija ve lo suyo, ni lo de su madre ni
#      lo de su hermana; un agente, lo de su cuenta.
#   3. La pantalla PINTADA en Chromium sobre el CSS del build, con el
#      `ReunionesClient` de verdad: ninguna reunión lleva video dentro, la
#      pestaña «Grabaciones» sale con su contador, la miniatura es pequeña, y
#      ampliar abre el video grande y al cerrar vuelve a la miniatura.
#
# `MODO=roto` pinta la pantalla de `ANTES_REF` (pinchado a un commit, nunca
# `origin/main`: en cuanto esto se fusione sería el «ahora») y lleva el filtro
# viejo escrito dentro, y AFIRMA los fallos: el video enorme dentro de la fila
# de la reunión, ninguna pestaña de grabaciones, y la madre sin las de sus hijas.
#
# Uso:  scripts/banco-grabaciones-de-reuniones.sh
#       MODO=roto scripts/banco-grabaciones-de-reuniones.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export MODO="${MODO:-bueno}"
export ANTES_REF="${ANTES_REF:-da71f3a}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

# ── Postgres de usar y tirar ────────────────────────────────────────────────
PGDIR=/tmp/pggrabacionesreuniones
PORT=55483
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

OUT=lib/__tests__/.compilado/grabaciones-de-reuniones
mkdir -p "$OUT"
npx esbuild lib/__tests__/fingido/entrada-de-grabaciones-de-reuniones.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only --external:minio \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-llamadas.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:next/headers=./lib/__tests__/fingido/stub-headers.ts \
  --alias:next/server=./lib/__tests__/fingido/next-server.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --alias:openai=./lib/__tests__/fingido/openai-de-mentira.ts \
  --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-grabaciones-de-reuniones.js"

# ── La pantalla, empaquetada para el navegador ──────────────────────────────
ENTRY=".banco-grabaciones-de-reuniones-entry.tsx"
ANTES_DIR="app/(root)/reuniones/_banco_antes"
trap 'rm -rf "$ENTRY" "$ANTES_DIR"' EXIT

if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_DIR"
  git show "$ANTES_REF":"app/(root)/reuniones/_components/ReunionesClient.tsx" > "$ANTES_DIR/ReunionesClient.tsx"
  mkdir -p "$ANTES_DIR/reuniones"
  git show "$ANTES_REF":"components/reuniones/GrabacionesDeLaReunion.tsx" > "$ANTES_DIR/reuniones/GrabacionesDeLaReunion.tsx"
  sed -i 's#@/components/reuniones/GrabacionesDeLaReunion#./reuniones/GrabacionesDeLaReunion#' "$ANTES_DIR/ReunionesClient.tsx"
  DESDE="@/app/(root)/reuniones/_banco_antes/ReunionesClient"
else
  DESDE="@/app/(root)/reuniones/_components/ReunionesClient"
fi

cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { ReunionesClient } from "$DESDE";
import { SALAS, HISTORIAL } from "./lib/__tests__/fingido/reuniones-de-mentira";

(window as any).pintar = () => {
    createRoot(document.getElementById("pantalla")!).render(
        React.createElement(ReunionesClient as any, {
            inicial: SALAS,
            variasCuentas: true,
            puedoAbrir: true,
            puedoNoCaducar: false,
            historial: HISTORIAL,
            dias: 90,
            fallo: null,
        }),
    );
};
(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm \
  --outfile="$OUT/pantalla.js" \
  --alias:@="$(pwd)" \
  --alias:@/actions/salas-de-video-actions=./lib/__tests__/fingido/reuniones-de-mentira.ts \
  --alias:@/components/video/ReunionEnLaPlataforma=./lib/__tests__/fingido/reuniones-de-mentira.ts \
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-mudo.ts \
  --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

echo "── Reuniones › Grabaciones (MODO=$MODO) ──"
node --test lib/__tests__/grabaciones-de-reuniones-db.test.mjs lib/__tests__/grabaciones-de-reuniones.test.mjs "$@"
