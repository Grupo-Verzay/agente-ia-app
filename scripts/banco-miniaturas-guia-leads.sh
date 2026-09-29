#!/usr/bin/env bash
# El banco de las MINIATURAS de la guía pública de Leads: todas las tarjetas
# de Secciones con el efecto de enfoque (la zona nítida en su recuadro, el
# resto atenuado), medido en los píxeles de cada `mini-*.webp`.
#
# Las miniaturas se generan desde la App real:
#   npm run build && SOLO_MINIATURAS=1 scripts/generar-guia-leads.sh
#
# `MODO=roto` lee la guía de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y afirma el fallo: cada tarjeta reutilizaba la captura de un
# paso, sin enfoque propio.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export MODO="${MODO:-bueno}" ANTES_REF="${ANTES_REF:-98a247c}"
node --test lib/__tests__/miniaturas-guia-leads.test.mjs
