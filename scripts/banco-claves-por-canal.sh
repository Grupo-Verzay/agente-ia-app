#!/usr/bin/env bash
# El banco del botón «Claves» de cada canal del Agente IA.
#
#  - La decisión pura (`lib/claves-por-canal.ts`): qué secciones tiene cada
#    canal, cuándo el botón avisa en ámbar y que una clave nunca se enseña
#    entera.
#  - Un barrido del código: el botón está a la vista y ANTES de Guardar, la
#    voz ya no se esconde en el «⋯», las acciones comprueban la cuenta, y la
#    clave de ElevenLabs ya no viaja al navegador.
#
# `MODO=roto` barre el código de antes (`ANTES_REF`, pinchado) y AFIRMA los
# fallos: sin botón, la voz en el «⋯» y la clave de ElevenLabs en claro.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANTES_REF="${ANTES_REF:-1d733ad}"
OUT=lib/__tests__/.compilado/claves-por-canal
mkdir -p "$OUT"

if [ "${MODO:-bueno}" != "roto" ]; then
  npx esbuild lib/claves-por-canal.ts lib/channel-training.ts --bundle \
    --platform=node --format=esm --outdir="$OUT" --out-extension:.js=.mjs --log-level=error
fi

node --test lib/__tests__/claves-por-canal.test.mjs "$@"
