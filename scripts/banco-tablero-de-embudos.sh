#!/usr/bin/env bash
# El tablero de Embudos ACABA EN SUS ETAPAS.
#
# Se mide en Chromium, sobre el CSS del build y con el `EmbudosClient` de
# VERDAD: la pregunta del encargo —«¿hay al final de las columnas un recuadro
# que parece una columna y no lo es?»— es de lo que se pinta, y no se contesta
# leyendo el código.
#
# `MODO=roto` monta el «antes», sacado con `git show` de un commit CONCRETO y
# puesto en una carpeta HERMANA de `_components` —así sus `../../crm/kanban/…`
# resuelven igual que los de hoy—, y AFIRMA el fallo: un hijo de más en la fila
# de columnas, punteado y con «Nueva etapa» dentro.
#
# El «antes» va PINCHADO, nunca a `origin/main`: en cuanto esto se fusione,
# `origin/main` pasa a ser el «ahora» y el modo roto se pondría verde sin
# ejercer nada. Ya le pasó a tres bancos de este repositorio.
#
# Uso:  scripts/banco-tablero-de-embudos.sh
#       MODO=roto scripts/banco-tablero-de-embudos.sh   <- afirma el fallo
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
# El tablero ANTES de este cambio: con el recuadro punteado al final.
ANTES_REF="${ANTES_REF:-b69b28a16987a86d517b997b16aa656353fb5408}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY=".banco-tablero-embudos-entry.tsx"
# Hermana de `_components`, no dentro: el componente importa
# `../../crm/kanban/_components/KanbanBoard` con ruta relativa, y desde una
# carpeta a la misma profundidad eso resuelve al mismo fichero.
ANTES_DIR="app/(root)/embudos/_banco_antes"
trap 'rm -rf "$ENTRY" "$ANTES_DIR"' EXIT

if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_DIR"
  git show "$ANTES_REF":"app/(root)/embudos/_components/EmbudosClient.tsx" > "$ANTES_DIR/EmbudosClient.tsx" || {
    echo "no se pudo leer EmbudosClient.tsx de $ANTES_REF; corre 'git fetch origin main'" >&2
    exit 1
  }
  DESDE="@/app/(root)/embudos/_banco_antes/EmbudosClient"
else
  DESDE="@/app/(root)/embudos/_components/EmbudosClient"
fi

cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { EmbudosClient } from "$DESDE";

(window as any).pintar = (inicial: any) => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("pantalla")!));
    raiz.render(React.createElement(EmbudosClient as any, { inicial }));
};
(window as any).listo = true;
TSX

node scripts/empaquetar-con-acciones-mudas.mjs \
  "$ENTRY" lib/__tests__/.compilado/harness-tablero-embudos.js \
  --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts

echo "── El tablero de Embudos acaba en sus etapas (MODO=$MODO) ──"
node --test lib/__tests__/tablero-de-embudos.test.mjs "$@"
