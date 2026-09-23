#!/usr/bin/env bash
# El banco de la llamada del chat de equipo: voz, video, subir de voz a video y
# el botón de plegar.
#
# Dos mitades, porque el cambio vive en dos capas:
#
#   1. `modo-de-la-llamada.test.mjs` — la regla, sin navegador: qué mandos hay
#      en cada modo (la pantalla compartida, SOLO en video), quién ve qué de una
#      petición de video, y cómo se anota la llamada en el directo.
#   2. `llamada-de-equipo.test.mjs` — DOS Chromium con cámara y micro falsos,
#      WebRTC de verdad entre los dos y las acciones de verdad contra Postgres.
#      Los fallos reportados solo existen con la llamada CONECTADA.
#
# `MODO=roto` monta la ventana, la pastilla y el oyente de `ANTES_REF` —sacados
# con `git show`, nunca de `origin/main`, que el día que esto se fusione pasa a
# ser el «ahora»— con las acciones de hoy, y afirma los dos fallos.
#
# Uso:  scripts/banco-llamada-de-equipo.sh          (hace falta `npm run build`)
#       MODO=roto scripts/banco-llamada-de-equipo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
# El commit de antes de este arreglo.
ANTES_REF="${ANTES_REF:-a15b609}"

if [ ! -d .next/static/css ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

# ── 1. La regla ─────────────────────────────────────────────────────────────
mkdir -p lib/__tests__/.compilado
npx tsc lib/modo-de-la-llamada.ts lib/llamada-de-voz.ts --outDir lib/__tests__/.compilado \
  --module es2022 --target es2022 --lib es2022,dom --moduleResolution bundler --skipLibCheck
# tsc deja los imports relativos sin extensión, y Node los pide con ella.
sed -i 's#from "./modo-de-la-llamada"#from "./modo-de-la-llamada.js"#' lib/__tests__/.compilado/llamada-de-voz.js
MODO="$MODO" ANTES_REF="$ANTES_REF" node --test lib/__tests__/modo-de-la-llamada.test.mjs

# ── 2. Dos navegadores, contra Postgres ─────────────────────────────────────
PGDIR=/tmp/pgllamadaequipo
PORT=55497
if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true
export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco
npx prisma db push --skip-generate --accept-data-loss >/dev/null

# El servidor: las acciones de producción, con `currentUser()` por persona.
npx esbuild lib/__tests__/fingido/entrada-de-llamada-de-equipo.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/llamada-de-equipo \
  --external:@prisma/client --external:server-only \
  --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-por-persona.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/llamada-de-equipo/entrada-de-llamada-de-equipo.js

# El navegador: el oyente del layout con su ventana, el de hoy o el de antes.
ENTRY=".banco-llamada-equipo-entry.tsx"
ANTES=".banco-llamada-antes"
trap 'rm -rf "$ENTRY" "$ANTES"' EXIT
ALIAS_ANTES=()
OYENTE="@/components/chat-equipo/OyenteDeLlamadas"
if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES/chat-equipo"
  git show "$ANTES_REF:components/chat-equipo/OyenteDeLlamadas.tsx" > "$ANTES/chat-equipo/OyenteDeLlamadas.tsx"
  git show "$ANTES_REF:components/chat-equipo/LaLlamada.tsx" > "$ANTES/chat-equipo/LaLlamada.tsx"
  git show "$ANTES_REF:components/shared/VentanaDeLlamada.tsx" > "$ANTES/VentanaDeLlamada.tsx"
  OYENTE="./$ANTES/chat-equipo/OyenteDeLlamadas"
  ALIAS_ANTES=(--alias:@/components/shared/VentanaDeLlamada=./$ANTES/VentanaDeLlamada.tsx)
fi
cat > "$ENTRY" <<TSX
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { OyenteDeLlamadas } from "$OYENTE";

createRoot(document.getElementById("app")!).render(
    <>
        <OyenteDeLlamadas />
        <Toaster />
    </>,
);
// Lo mismo que hace el menú de la cabecera del directo.
(window as any).llamar = (canalId: string, conQuien: string, modo: string) =>
    window.dispatchEvent(new CustomEvent("llamada:salir", { detail: { canalId, conQuien, modo } }));
(window as any).listo = true;
TSX
npx esbuild "$ENTRY" --bundle --format=esm --platform=browser --jsx=automatic \
  --outfile=lib/__tests__/.compilado/harness-llamada-de-equipo.js \
  --define:process.env.NODE_ENV='"production"' \
  --alias:@/actions/llamadas-actions=./lib/__tests__/fingido/llamadas-por-el-puente.ts \
  "${ALIAS_ANTES[@]}" --log-level=error

MODO="$MODO" node --test --test-concurrency=1 lib/__tests__/llamada-de-equipo.test.mjs "$@"
