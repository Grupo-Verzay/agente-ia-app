#!/usr/bin/env bash
# Banco de Perfil › Cuenta › «Plan y facturación». MODO=roto lee ANTES_REF y
# afirma el fallo (plan puesto a mano visto como prueba, con los planes debajo).
set -euo pipefail
cd "$(dirname "$0")/.."
node --experimental-strip-types --no-warnings lib/__tests__/plan-del-perfil.test.mjs
