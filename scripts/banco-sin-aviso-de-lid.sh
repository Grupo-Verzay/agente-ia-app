#!/usr/bin/env bash
# El banco de la barra de «ID interno de WhatsApp» que se quitó de Chats.
# Corre el barrido en los dos modos: el bueno sobre el árbol de trabajo y el roto
# sobre la cabecera de ANTES_REF, afirmando que allí la barra estaba.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"
MODO=bueno node --test lib/__tests__/sin-aviso-de-lid.test.mjs
MODO=roto  node --test lib/__tests__/sin-aviso-de-lid.test.mjs
