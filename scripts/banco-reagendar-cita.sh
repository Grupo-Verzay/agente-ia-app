#!/usr/bin/env bash
# El banco de «Reagendar» una cita de Agenda.
#
# Dos mitades:
#
#  - **La regla y un barrido del código** (`reagendar-cita.test.mjs`), sin
#    base: en qué estado queda la cita, qué franja se acepta, qué
#    recordatorios se programan; y que los cuatro sitios donde se cambia el
#    estado de una cita abren el MISMO diálogo, con el MISMO selector de fecha
#    y hora que agendar.
#  - **Las ACCIONES contra Postgres** (`reagendar-cita-db.test.mjs`): la misma
#    fila, su historial, los recordatorios viejos que se van y los nuevos que
#    salen completos desde la nueva hora, y lo que no se puede tocar.
#
# Y las dos corren además en `MODO=roto`, contra `ANTES_REF` —pinchado a un
# commit, nunca `origin/main`, que pasa a ser el «ahora» en cuanto esto se
# fusione—, y AFIRMAN el fallo: no había reagendar, y mover la hora de una cita
# dejaba los recordatorios de la hora vieja.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
ANTES_REF="${ANTES_REF:-626a48c}"
export ANTES_REF

PGDIR=/tmp/pgreagendar
PORT=55511
if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
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

OUT=lib/__tests__/.compilado/reagendar
mkdir -p "$OUT"
npx esbuild lib/reagendar-cita.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --external:@prisma/client --log-level=error

# El «antes»: las acciones de citas de ANTES_REF, con sus `./` apuntados a las
# de hoy (auditoría y calendario no cambian: lo que se compara es la cita).
ANTES_DIR=lib/__tests__/.antes/reagendar
trap 'rm -rf "$ANTES_DIR"' EXIT
mkdir -p "$ANTES_DIR/actions"
git show "$ANTES_REF:actions/appointments-actions.ts" \
  | sed "s#from '\./#from '@/actions/#g" > "$ANTES_DIR/actions/appointments-actions.ts"

for ENTRADA in entrada-de-reagendar entrada-de-reagendar-antes; do
  npx esbuild "lib/__tests__/fingido/$ENTRADA.ts" --bundle \
    --platform=node --format=esm --outfile="$OUT/$ENTRADA.js" \
    --alias:@="$(pwd)" \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --external:@prisma/client --external:server-only \
    --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" \
    --log-level=error
  sed -i '/server-only/d' "$OUT/$ENTRADA.js"
done

node --test --test-concurrency=1 lib/__tests__/reagendar-cita.test.mjs \
            lib/__tests__/reagendar-cita-db.test.mjs "$@"

echo
echo "── Reagendar, con la forma VIEJA (tiene que afirmar el fallo) ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/reagendar-cita.test.mjs \
                      lib/__tests__/reagendar-cita-db.test.mjs

# ── La pantalla, en Chromium (necesita el CSS de `npm run build`) ──
if [ -d ".next/static/css" ]; then
  export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
  export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
  ENTRY=".banco-reagendar-entry.tsx"
  trap 'rm -rf "$ANTES_DIR" "$ENTRY"' EXIT
  cat > "$ENTRY" <<'TSX'
import React from "react";
import { createRoot } from "react-dom/client";
import { ChatAppointmentStatusButton } from "@/app/(root)/chats/_components/ChatAppointmentStatusButton";
createRoot(document.getElementById("raiz")!).render(
  React.createElement(ChatAppointmentStatusButton, { sessionId: 1, userId: "quien-mira", remoteJid: "573001112233@s.whatsapp.net" }),
);
(window as any).listo = true;
TSX
  npx esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT/harness-reagendar.js" \
    --alias:@="$(pwd)" \
    --alias:@/actions/appointments-actions=./lib/__tests__/fingido/acciones-de-reagendar.ts \
    --alias:@/actions/getAvailableSlots-actions=./lib/__tests__/fingido/huecos-de-reagendar.ts \
    --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts \
    --loader:.tsx=tsx --jsx=automatic \
    --define:process.env.NODE_ENV='"production"' --log-level=error
  echo
  echo "── Reagendar en la pantalla (Chromium) ──"
  node --test lib/__tests__/reagendar-en-la-pantalla.test.mjs
else
  echo "(sin .next/static/css: la mitad de navegador se salta; corre 'npm run build' antes)"
fi
