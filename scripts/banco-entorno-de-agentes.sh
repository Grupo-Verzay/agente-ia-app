#!/usr/bin/env bash
# Banco del entorno de los agentes de Claude Code (docs/entorno-claude-code-agentes.md).
#   scripts/banco-entorno-de-agentes.sh           la guía, el comprobador y los flujos dicen lo mismo
#   MODO=roto scripts/banco-entorno-de-agentes.sh  afirma que en ANTES_REF no había ni guía ni comprobador
# Sin red ni base: lee ficheros. Los clones de api-webhook y astracalls en
# /home/user se usan si están; la App se mira siempre.
set -euo pipefail
cd "$(dirname "$0")/.."
export ANTES_REF="${ANTES_REF:-8c898bd}"
node --test lib/__tests__/entorno-de-agentes.test.mjs
