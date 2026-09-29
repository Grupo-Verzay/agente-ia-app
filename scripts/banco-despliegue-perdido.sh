#!/usr/bin/env bash
# Banco del vigilante del despliegue (.github/workflows/despliegue-perdido.yml).
#   scripts/banco-despliegue-perdido.sh           la decisión, el vigilante contra una API fingida y los flujos
#   MODO=roto scripts/banco-despliegue-perdido.sh  afirma que en ANTES_REF nada volvía a mirar un push perdido
# Sin red ni base. ANTES_REF va PINCHADO a la fusión del #1047 —la que se quedó
# sin corrida—, nunca a origin/main, que pasa a ser el «después» en cuanto esto
# se fusione.
set -euo pipefail
cd "$(dirname "$0")/.."
export ANTES_REF="${ANTES_REF:-a147eaf}"
node --test lib/__tests__/despliegue-perdido.test.mjs
