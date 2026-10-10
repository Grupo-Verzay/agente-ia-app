#!/usr/bin/env bash
# Videollamada con Verzy: pedir un humano (3 minutos de espera), la incomodidad
# que no se dice (alerta silenciosa), el cierre de venta en cualquier minuto
# (comprar o un NO → Descartado) y el reloj fijo de 30 minutos (25, 29, 30).
# Las reglas puras y la sala MONTADA en Chromium con un Daily de mentira y el
# reloj del navegador falso. `MODO=roto` monta la sala de un commit PINCHADO
# (nunca origin/main) y afirma que allí nada de esto existía.
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${MODO:-bueno}"; export MODO
# 86f29ee — antes de esto: la sala no oía pedir un humano, ni un NO, ni avisaba del tiempo.
ANTES_REF="${ANTES_REF:-86f29ee}"
if [ "$MODO" = roto ]; then
  ARBOL="$(mktemp -d)/sala"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  trap 'git worktree remove --force "$ARBOL" 2>/dev/null || true' EXIT
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DE_LA_SALA="$ARBOL"
fi
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node --test lib/__tests__/atencion-de-la-videollamada.test.mjs
