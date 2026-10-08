#!/usr/bin/env bash
# Un solo control del estado de sesión en la cabecera. MODO=roto lee ANTES_REF.
set -euo pipefail
cd "$(dirname "$0")/.."
node lib/__tests__/estado-de-sesion-en-la-cabecera.test.mjs
