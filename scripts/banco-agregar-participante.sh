#!/usr/bin/env bash
# Banco de la acción de flujo «Agregar participante»: está en la paleta, en el
# catálogo por plan, en la guía y en el esquema, comparte el selector de asesor
# con «Asignar asesor», y lanzada a mano pide ADD_PARTICIPANT al motor.
# MODO=roto lee ANTES_REF y afirma que no existía.
set -euo pipefail
cd "$(dirname "$0")/.."
export ANTES_REF="${ANTES_REF:-a3c678e}"
OUT=lib/__tests__/.compilado/agregar-participante
mkdir -p "$OUT"
cat > "$OUT/db-falso.mjs" <<'JS'
export const db = { session: { findFirst: async () => ({ id: 7 }) } };
JS
npx esbuild lib/workflow-automation-nodes.ts --bundle --platform=node --format=esm \
  --alias:@/lib/db="./$OUT/db-falso.mjs" --outfile="$OUT/nodos.mjs" --log-level=error
export NODOS_COMPILADO="$PWD/$OUT/nodos.mjs"
node lib/__tests__/agregar-participante.test.mjs
