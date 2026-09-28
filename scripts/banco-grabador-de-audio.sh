#!/usr/bin/env bash
# El banco del grabador de audio: grabar, pausar y detener AHÍ MISMO donde
# antes solo se podía subir un archivo.
#
# Tres mitades:
#   1. La regla (`lib/grabador-de-audio.ts`) y el archivo que se sube
#      (`comoArchivoDeAudio`), sin navegador.
#   2. Un barrido: las seis pantallas que suben audio (Macros, los dos
#      editores de flujos, Recordatorios, Multiagenda y Seguimientos del CRM)
#      pintan el MISMO `GrabadorDeAudio` y lo meten por el MISMO camino que un
#      archivo elegido del dispositivo.
#   3. El `GrabadorDeAudio` REAL en Chromium con micrófono falso: grabar,
#      pausar (el tiempo se para), reanudar, detener, escuchar y usar; y el
#      archivo que sale lo aceptan los dos editores de flujos.
#
# `MODO=roto` lee las seis pantallas y el hook de `ANTES_REF` (pinchado a un
# commit: `origin/main` sería el «ahora» en cuanto esto se fusione) y afirma
# el fallo: ninguna podía grabar, el hook no sabía pausar, y una grabación con
# los códecs en el tipo la rechazaban los flujos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export ANTES_REF="${ANTES_REF:-97ae916}"
export MODO
mkdir -p lib/__tests__/.compilado
C=lib/__tests__/.compilado

npx esbuild lib/grabador-de-audio.ts --format=esm --log-level=warning --outfile="$C/grabador-de-audio.regla.mjs"
npx esbuild lib/audio-del-navegador.ts --format=esm --log-level=warning --outfile="$C/grabador-de-audio.archivo.mjs"
npx esbuild "app/(root)/workflow/[workflowId]/helpers/validateFileType.ts" --format=esm --log-level=warning \
  --outfile="$C/grabador-de-audio.validar.mjs"

if [ "$MODO" != "roto" ]; then
  npx tailwindcss -i app/globals.css -o "$C/grabador-de-audio.css" 2>&1 | tail -1
  npx esbuild lib/__tests__/grabador-de-audio/entrada.tsx --bundle --format=esm --jsx=automatic \
    --loader:.tsx=tsx --define:process.env.NODE_ENV='"production"' --log-level=warning \
    --outfile="$C/grabador-de-audio.arnes.js"
fi

node --test lib/__tests__/grabador-de-audio.test.mjs "$@"
