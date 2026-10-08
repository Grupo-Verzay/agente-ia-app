#!/usr/bin/env bash
# Banco: el botón «Configuración» de Panel › Propuestas lleva un engranaje, no una etiqueta.
# MODO=roto lee ANTES_REF (pinchado) y afirma que llevaba la etiqueta.
set -euo pipefail
cd "$(dirname "$0")/.."
ANTES_REF="${ANTES_REF:-62386d4}"
F="app/(root)/(protected)/panel/propuestas/_components/PropuestasClient.tsx"
if [ "${MODO:-bueno}" = "roto" ]; then SRC=$(git show "$ANTES_REF:$F"); else SRC=$(cat "$F"); fi
BOTON=$(printf '%s' "$SRC" | awk '/data-abrir-eslogan/{p=1} p{print} /<\/Button>/{if(p)exit}')
fallos=0
ok(){ echo "ok   $1"; }; mal(){ echo "MAL  $1"; fallos=$((fallos+1)); }
if [ "${MODO:-bueno}" = "roto" ]; then
  printf '%s' "$BOTON" | grep -q '<Tag ' && ok "antes: etiqueta (afirmado)" || mal "antes no llevaba la etiqueta"
  exit $fallos
fi
printf '%s' "$BOTON" | grep -q '<Settings ' && ok "el botón lleva el engranaje" || mal "falta el engranaje"
printf '%s' "$BOTON" | grep -q '<Tag ' && mal "sigue la etiqueta" || ok "sin etiqueta"
printf '%s' "$SRC" | grep -qE 'import \{[^}]*\bSettings\b[^}]*\} from "lucide-react"' && ok "import de Settings" || mal "falta el import"
[ $fallos -eq 0 ]
