#!/usr/bin/env bash
# El banco de la cabecera de la conversación y del panel «Contexto del lead».
#
# Dos mitades:
#
#   1. La DECISIÓN y un BARRIDO del código, sin navegador
#      (`cabecera-del-chat.test.mjs`): qué pestañas caben y cuáles se pliegan
#      en «Más», cómo se guarda la síntesis, que el icono de Síntesis ya no
#      está en la barra, el orden de los bloques del panel y que los tres de
#      arriba van en formato directo.
#   2. Lo PINTADO, en Chromium sobre el CSS del build
#      (`cabecera-del-chat-dom.test.mjs`), con los componentes reales:
#      `PestanasDelChat` en una fila con Macros y Acciones a cinco anchos de
#      cabecera; el menú de la cita agendada con el filo de la conversación
#      (menos 16 px) esté donde esté su botón; y el `LeadContextSheet`
#      real —con sus tres acciones de servidor fingidas— editando y guardando
#      la síntesis en el propio panel.
#
# `MODO=roto` lo construye todo con el código de ANTES_REF (el commit anterior a
# este arreglo, pinchado: `origin/main` pasa a ser el «ahora» en cuanto esto se
# fusiona) y AFIRMA los fallos del encargo.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-22dd27b}"
export ANTES_REF

mkdir -p lib/__tests__/.compilado
npx tsc lib/pestanas-del-chat.ts lib/sintesis-del-lead.ts lib/paneles-flotantes.ts \
  --outDir lib/__tests__/.compilado \
  --module esnext --target es2022 --moduleResolution bundler --skipLibCheck

node --test lib/__tests__/cabecera-del-chat.test.mjs "$@"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

ANTES_DIR=".banco-antes-cabecera"
trap 'rm -rf "$ANTES_DIR"' EXIT
rm -rf "$ANTES_DIR"
if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_DIR/lib" "$ANTES_DIR/hooks" "$ANTES_DIR/chats"
  git show "$ANTES_REF:lib/paneles-flotantes.ts" > "$ANTES_DIR/lib/paneles-flotantes.ts"
  git show "$ANTES_REF:hooks/usePanelFlotante.ts" \
    | sed 's#@/lib/paneles-flotantes#../lib/paneles-flotantes#' > "$ANTES_DIR/hooks/usePanelFlotante.ts"
  git show "$ANTES_REF:app/(root)/chats/_components/LeadContextSheet.tsx" > "$ANTES_DIR/chats/LeadContextSheet.tsx"
fi

# esbuild no es dependencia de la App: se trae con npx, como los demás bancos,
# y se le pasa al constructor la ruta del paquete.
ESBUILD_DIR="$(npx -y -p esbuild -c 'dirname "$(dirname "$(readlink -f "$(which esbuild)")")"')"
export ESBUILD_DIR
node scripts/construir-banco-cabecera-del-chat.mjs
node --test lib/__tests__/cabecera-del-chat-dom.test.mjs "$@"
