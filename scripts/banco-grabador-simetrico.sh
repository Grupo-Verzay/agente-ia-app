#!/usr/bin/env bash
# Los botones del grabador de audio ocupan el ancho ENTERO de su caja, a
# partes iguales, en las tres etapas (Grabar audio · Pausar/Detener/Descartar
# · Usar grabación/Grabar otra/Descartar). Antes iban pegados a la izquierda
# y dejaban un hueco vacío a la derecha de la tarjeta.
#
# Lo mide en Chromium, sobre el CSS del build y con el `GrabadorDeAudio` REAL
# (el mismo que pintan el paso «Nota de voz» de los dos editores de flujos,
# Macros, Recordatorios, Multiagenda y Seguimientos), con micrófono falso, a
# 274 px (el contenido de la tarjeta de un paso de flujo), 360 y 520 (Macros).
#
# `MODO=roto` monta el componente de `ANTES_REF` (pinchado a un commit, nunca
# `origin/main`) y AFIRMA el hueco de la derecha.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export MODO="${MODO:-bueno}"
export ANTES_REF="${ANTES_REF:-28daebd}"
C=lib/__tests__/.compilado
mkdir -p "$C"

ALIAS=()
if [ "$MODO" = "roto" ]; then
  mkdir -p components/shared/.antes-grabador
  git show "$ANTES_REF:components/shared/GrabadorDeAudio.tsx" > components/shared/.antes-grabador/GrabadorDeAudio.tsx
  trap 'rm -rf components/shared/.antes-grabador' EXIT
  ALIAS=(--alias:@/components/shared/GrabadorDeAudio=./components/shared/.antes-grabador/GrabadorDeAudio.tsx)
fi

npx tailwindcss -i app/globals.css -o "$C/grabador-simetrico.css" 2>&1 | tail -1
npx esbuild lib/__tests__/grabador-simetrico/entrada.tsx --bundle --format=esm --jsx=automatic \
  --loader:.tsx=tsx --define:process.env.NODE_ENV='"production"' --log-level=warning \
  "${ALIAS[@]}" --outfile="$C/grabador-simetrico.arnes.js"

node --test lib/__tests__/grabador-simetrico.test.mjs "$@"
