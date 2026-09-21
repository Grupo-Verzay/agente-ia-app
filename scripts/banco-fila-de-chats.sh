#!/usr/bin/env bash
# El banco de la fila de Chats sin sus dos selectores.
#
# Se quitaron de cada fila de la lista el **estado del cliente** (Activo /
# Inactivo / Sin clasificar) y el **tipo de asistencia** (IA / Humana / Sin
# asignar), y del menú «⌄» sus cuatro filtros. Nada de eso tocó la base.
#
# Son DOS mitades, porque el cambio vive en dos capas y cada una se rompe de
# una forma distinta:
#
#   1. `estado-y-servicio-db.test.mjs` — contra Postgres de usar y tirar y con
#      el esquema REAL: los valores siguen guardados, la consulta de la bandeja
#      los sigue devolviendo y abrir Chats no los toca.
#   2. `fila-de-chats.test.mjs` — en Chromium, sobre el CSS del build y con los
#      componentes REALES: la fila se dibuja igual sin ellos —ni franja en
#      blanco ni cambio de alto— y el menú ya no ofrece los cuatro filtros.
#
# La segunda corre en dos modos, y el «antes» **no se escribe a mano**: se saca
# de `origin/main` con `git show`, así que lo que el modo roto mide es el
# componente que había, no una copia suya.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"

# ─────────────────────────────────────────────────────────────────────────────
# 1. La base
# ─────────────────────────────────────────────────────────────────────────────
PGDIR=/tmp/pgfilachats
PORT=55461

if [ ! -d "$PGDIR" ]; then
  rm -rf "$PGDIR"
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
# Relleno: el paquete arrastra la validación de entorno del servidor, que no
# decide nada de lo que este banco prueba.
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

# `currentUser` es lo ÚNICO que se finge: el de verdad pide next-auth entero y
# no decide nada de lo que se prueba aquí.
npx esbuild lib/__tests__/fingido/entrada-de-la-fila.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/fila \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-la-fila.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/fila/entrada-de-la-fila.js

node --test lib/__tests__/estado-y-servicio-db.test.mjs "$@"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Los componentes, en Chromium
# ─────────────────────────────────────────────────────────────────────────────
if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

COMP="app/(root)/chats/_components"
ANTES="app/(root)/chats/.banco-antes"
ENTRY=".banco-fila-de-chats-entry.tsx"
OUT="lib/__tests__/.compilado/harness-fila-de-chats.js"
mkdir -p "$(dirname "$OUT")"
trap 'rm -rf "$ANTES" "$ENTRY"' EXIT

if [ "$MODO" = "roto" ]; then
  # El «antes» sale de `origin/main`, no de una copia escrita aquí: copiada, el
  # modo roto mediría lo que alguien recuerda del componente viejo.
  #
  # Los cuatro ficheros van a un directorio HERMANO de `_components`, así que
  # sus imports de `../../sessions/...` y de `@/...` resuelven igual; lo único
  # que se reescribe son los `./` que apuntaban a los vecinos que se quedan, y
  # los dos selectores borrados vuelven aquí con su nombre para que sigan
  # resolviendo con `./`.
  mkdir -p "$ANTES"
  git fetch origin main --quiet 2>/dev/null || true
  for f in ChatContactItem ChatTabBar ClientStatusSelect ServiceTypeSelect; do
    git show "origin/main:$COMP/$f.tsx" > "$ANTES/$f.tsx"
  done
  for f in ChatContactItem ChatTabBar; do
    sed -i 's#from "\./#from "../_components/#g; s#from '"'"'\./#from '"'"'../_components/#g' "$ANTES/$f.tsx"
    sed -i 's#from "\.\./_components/ClientStatusSelect"#from "./ClientStatusSelect"#; s#from "\.\./_components/ServiceTypeSelect"#from "./ServiceTypeSelect"#' "$ANTES/$f.tsx"
  done
  DESDE="@/app/(root)/chats/.banco-antes"
else
  DESDE="@/$COMP"
fi

cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatContactItem } from "$DESDE/ChatContactItem";
import { ChatTabBar } from "$DESDE/ChatTabBar";

const nada = () => {};

/*
 * El arnés arma las props DENTRO del navegador: los manejadores no se pueden
 * serializar para cruzar \`page.evaluate\`, y la fila no se monta sin ellos.
 *
 * Se pasan siempre las de los dos selectores (\`clientValidationEnabled\` y sus
 * dos \`onChange\`). La versión de ahora no las declara y las ignora; la de
 * \`origin/main\` las necesita, así que el modo roto pinta lo que había sin
 * tocar una línea del componente.
 */
(window as any).pintarFila = (contacto: any) => {
    const raiz = ((window as any).__raizFila ??= createRoot(document.getElementById("fila")!));
    raiz.render(
        React.createElement(ChatContactItem as any, {
            contact: contacto,
            selected: false,
            onArchive: nada,
            onDeleteRequest: nada,
            onSelect: nada,
            onTogglePin: nada,
            clientValidationEnabled: true,
            onServiceTypeChange: nada,
            onClientStatusChange: nada,
        }),
    );
};

(window as any).pintarPestanas = () => {
    const raiz = ((window as any).__raizPestanas ??= createRoot(document.getElementById("pestanas")!));
    raiz.render(
        React.createElement(ChatTabBar as any, {
            tab: "all",
            onTabChange: nada,
            tabCounts: { all: 12, mine: 3, dm: 9, groups: 3, archived: 2, resolved: 4 },
            showMine: true,
            unreadOnly: false,
            onToggleUnread: nada,
            unreadCount: 5,
            enEsperaOnly: false,
            onToggleEnEspera: nada,
            enEsperaCount: 1,
            starredOnly: false,
            onToggleStarred: nada,
            starredCount: 2,
            notesOnly: false,
            onToggleNotes: nada,
            notesCount: 1,
            onCompose: nada,
            // Los cuatro filtros que se quitaron. La versión de ahora no los
            // declara; la de \`origin/main\` los pinta con esto.
            clientStatusFilter: null,
            onSetClientStatus: nada,
            clientActiveCount: 7,
            clientInactiveCount: 2,
            serviceTypeFilter: null,
            onSetServiceType: nada,
            iaCount: 6,
            humanCount: 3,
        }),
    );
};

(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT" \
  --alias:@="$(pwd)" \
  --alias:@/actions/session-action=./lib/__tests__/fingido/acciones-mudas.ts \
  --alias:@/actions/advisor-assign-actions=./lib/__tests__/fingido/acciones-mudas.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

rm -f "$ENTRY"
rm -rf "$ANTES"

node --test lib/__tests__/fila-de-chats.test.mjs "$@"
