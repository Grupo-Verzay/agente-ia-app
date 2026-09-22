#!/usr/bin/env bash
# El banco de la TABLA de CRM › Llamadas: la fila alineada como en Leads.
#
# Se mide en Chromium y sobre el CSS del build porque las tres preguntas del
# encargo son de píxeles y no se contestan leyendo:
#
#   1. ¿el número arranca a la IZQUIERDA de su celda o va centrado?
#   2. ¿se pinta AZUL —o sea, se lee como el enlace que es— o en negro?
#   3. ¿la tabla tiene UN tamaño de letra o dos?
#
# Y una cuarta que sí se lee del código, porque vive en otro componente: que la
# fila de pestañas del CRM no se pinta dentro de Llamadas.
#
# Los dos lados salen de código de VERDAD. El «ahora» es `CallsCrmClient.tsx`
# del árbol de trabajo; el «antes», el mismo fichero de un commit CONCRETO
# sacado con `git show` y puesto **junto a sus vecinos**, para que sus `./`
# resuelvan igual. Copiado a mano se estaría midiendo lo que alguien recuerda
# de la pantalla vieja.
#
# Y el «antes» va PINCHADO a un commit, no a `origin/main`: en cuanto esto se
# fusione, `origin/main` pasa a ser el «ahora» y el modo roto dejaría de
# reproducir nada — se pondría verde sin ejercer el fallo, que es la peor
# forma de tener un banco. Le pasó al de al lado
# (`scripts/banco-llamar-con-ia.sh`), que se quedó sin su ancla el día que su
# cambio entró en main.
#
# Lo único que se finge son las acciones de servidor, y con los MISMOS datos
# en los dos modos: así la única diferencia medible es cómo se pinta la fila.
#
# Uso:  scripts/banco-tabla-de-llamadas.sh
#       MODO=roto scripts/banco-tabla-de-llamadas.sh   <- afirma los fallos
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
# El estado de la pantalla ANTES de este cambio. Se puede apuntar a otro sitio
# con ANTES_REF=... para comparar contra una versión distinta.
ANTES_REF="${ANTES_REF:-8471ae191e3adc9cda2bf73a6fedc45c3e971b24}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY=".banco-tabla-entry.tsx"
# El «antes» va en la carpeta de sus vecinos: ahí dentro sus `./DialogoDeLlamar`
# y `./CallDetailDialog` resuelven sin tocar una sola línea del fichero.
ANTES="app/(root)/crm/llamadas/_components/BancoTablaAntes.tsx"
trap 'rm -f "$ENTRY" "$ANTES"' EXIT

if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF":"app/(root)/crm/llamadas/_components/CallsCrmClient.tsx" > "$ANTES" || {
    echo "no se pudo leer CallsCrmClient.tsx de $ANTES_REF; corre 'git fetch origin main'" >&2
    exit 1
  }
  DESDE="@/app/(root)/crm/llamadas/_components/BancoTablaAntes"
else
  DESDE="@/app/(root)/crm/llamadas/_components/CallsCrmClient"
fi

cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { CallsCrmClient } from "$DESDE";

(window as any).pintarTabla = () => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("pantalla")!));
    raiz.render(React.createElement(CallsCrmClient as any, { embedded: true, cuentas: [], cuentaPropia: "u1" }));
};
(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm \
  --outfile=lib/__tests__/.compilado/harness-tabla-de-llamadas.js \
  --alias:@="$(pwd)" \
  --alias:@/actions/calls-crm-actions=./lib/__tests__/fingido/llamadas-del-crm.ts \
  --alias:@/actions/missed-call-reply-actions=./lib/__tests__/fingido/acciones-de-llamadas-mudas.ts \
  --alias:@/actions/voicebot-actions=./lib/__tests__/fingido/acciones-de-llamadas-mudas.ts \
  --alias:@/actions/crm-follow-up-actions=./lib/__tests__/fingido/acciones-de-llamadas-mudas.ts \
  --alias:@/components/chats/AnfitrionDeLlamada=./lib/__tests__/fingido/anfitrion-mudo.ts \
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-mudo.ts \
  --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

echo "── la tabla de CRM › Llamadas (MODO=$MODO) ──"
node --test lib/__tests__/tabla-de-llamadas.test.mjs "$@"
