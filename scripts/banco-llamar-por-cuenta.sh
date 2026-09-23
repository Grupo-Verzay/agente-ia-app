#!/usr/bin/env bash
# El banco del «Vía:» del marcador de CRM › Llamadas: la llamada sale por la
# cuenta elegida — número, créditos y registro — y cada cuenta solo ve lo suyo
# y lo que cuelga hacia abajo.
#
# Dos mitades, porque el cambio vive en dos capas:
#
#   1. `llamar-por-cuenta.test.mjs` — contra Postgres (esquema REAL, `db push`)
#      con las acciones de verdad: qué cuentas se ofrecen a la madre, a una hija
#      y a un agente; y que Llamar y Llamar IA por la elegida salen con SU
#      número, se registran en ella y cobran la transcripción a ella.
#   2. `dialogo-de-llamar-por-cuenta.test.mjs` — en Chromium, el
#      `DialogoDeLlamar` real: la propia preseleccionada, la apagada no se
#      elige, y la línea de la elegida es la que viaja al pulsar.
#
# `MODO=roto` corre la segunda con el diálogo de ANTES (commit pinchado) y
# afirma el fallo: sin «Vía:», las dos llamadas salen sin cuenta.
set -euo pipefail
cd "$(dirname "$0")/.."

ANTES_REF="${ANTES_REF:-d97ec9f}"
MODO="${MODO:-bueno}"
export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
mkdir -p lib/__tests__/.compilado

# ── 1. Postgres ─────────────────────────────────────────────────────────────
if [ "$MODO" != "roto" ]; then
  PGDIR=/tmp/pgllamarporcuenta
  PORT=55483
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
         S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco
  export ASTRACALLS_URL=http://localhost:1 ASTRACALLS_API_KEY=banco
  npx prisma db push --skip-generate --accept-data-loss >/dev/null

  npx esbuild lib/__tests__/fingido/entrada-de-llamar-por-cuenta.ts --bundle \
    --platform=node --format=esm --outdir=lib/__tests__/.compilado/llamar-por-cuenta \
    --external:@prisma/client --external:server-only --external:minio \
    --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-llamadas.ts \
    --alias:openai=./lib/__tests__/fingido/openai-de-mentira.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:next/server=./lib/__tests__/fingido/next-server.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --log-level=error
  sed -i '/server-only/d' lib/__tests__/.compilado/llamar-por-cuenta/entrada-de-llamar-por-cuenta.js

  echo "── las acciones contra Postgres ──"
  node --test lib/__tests__/llamar-por-cuenta.test.mjs
fi

# ── 2. El diálogo en Chromium ───────────────────────────────────────────────
DIALOGO="app/(root)/crm/llamadas/_components/DialogoDeLlamar.tsx"
ANTES_DIALOGO=".banco-dialogo-antes.tsx"
ENTRY=".banco-dialogo-de-llamar-entry.tsx"
trap 'rm -f "$ANTES_DIALOGO" "$ENTRY"' EXIT
if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:$DIALOGO" > "$ANTES_DIALOGO"
  DESDE="@/.banco-dialogo-antes"
else
  DESDE="@/app/(root)/crm/llamadas/_components/DialogoDeLlamar"
fi

cat > "$ENTRY" <<TSX
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DialogoDeLlamar } from "$DESDE";

function Pantalla() {
    const [numero, setNumero] = useState("");
    const anotar = (cual: string) => (linea?: string | null) => {
        ((window as any).__llamadas ??= []).push({ cual, linea });
    };
    return React.createElement(DialogoDeLlamar as any, {
        numero, alEscribir: setNumero,
        alLlamar: anotar("llamar"), alLlamarConIa: anotar("ia"), llamandoConIa: false,
    });
}
(window as any).pintar = () => createRoot(document.getElementById("raiz")!).render(React.createElement(Pantalla));
(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm \
  --outfile=lib/__tests__/.compilado/harness-dialogo-de-llamar.js \
  --alias:@="$(pwd)" \
  --alias:@/actions/cuentas-para-llamar-actions=./lib/__tests__/fingido/cuentas-para-llamar-de-mentira.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

echo
echo "── el diálogo en Chromium (MODO=$MODO) ──"
MODO="$MODO" node --test lib/__tests__/dialogo-de-llamar-por-cuenta.test.mjs
