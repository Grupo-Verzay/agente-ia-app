#!/usr/bin/env bash
# Videollamada con IA de Verzay (Tavus) en Agenda › Ajustes: las reglas puras.
# `MODO=roto` lee los ajustes de un commit PINCHADO (nunca origin/main) y
# afirma que allí solo existía el enlace fijo.
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${MODO:-bueno}"; export MODO
# fc9e014 — antes de esto: no había modo Tavus.
ANTES_REF="${ANTES_REF:-fc9e014}"
if [ "$MODO" = roto ]; then
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  git show "$ANTES_REF:app/(root)/schedule/_components/settings/UpdateMeetingDuration.tsx" > "$TMP/ajustes.tsx"
  export AJUSTES_DE_LA_REUNION="$TMP/ajustes.tsx"
  if git cat-file -e "$ANTES_REF:lib/videollamada-ia.ts" 2>/dev/null; then export HAY_MODULO_ANTES=si; else export HAY_MODULO_ANTES=no; fi
else
  mkdir -p lib/__tests__/.compilado
  npx esbuild lib/videollamada-ia.ts --bundle --format=esm --platform=node \
    --outfile=lib/__tests__/.compilado/videollamada-ia.js --log-level=warning
  npx esbuild lib/pantalla-del-avatar.ts --bundle --format=esm --platform=node \
    --outfile=lib/__tests__/.compilado/pantalla-del-avatar.js --log-level=warning
  npx esbuild lib/videollamada-en-vivo.ts --bundle --format=esm --platform=node \
    --outfile=lib/__tests__/.compilado/videollamada-en-vivo.js --log-level=warning
fi
node --test lib/__tests__/videollamada-ia.test.mjs
