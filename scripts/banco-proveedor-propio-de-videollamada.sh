#!/usr/bin/env bash
# La videollamada con DOS proveedores que conviven, como Evolution y Waha:
# Tavus (lo de siempre) y el MOTOR PROPIO de Verzay (voz, oído, IA y
# transcripción propios, y el LOGO de Verzay como participante que late con la
# voz). La sala, el guion, las herramientas, la grabación, el resumen y el CRM
# son los mismos.
#
#   1. Las reglas puras (proveedor, traducción Realtime ⇄ Tavus leída por los
#      lectores de la sala, herramientas, sesión, transcripción, logo, cobro).
#   2. El servidor compilado con dobles (abrir con cada proveedor, la sesión de
#      voz, el cobro con tope y la entrega al CRM una sola vez).
#   3. La sala MONTADA en Chromium con un motor de mentira.
#   4. Cliente y asesor en dos pestañas con WebRTC de verdad.
#
# `MODO=roto` compila lo mismo de `ANTES_REF` (2f3633e, pinchado a un commit,
# nunca `origin/main`) y AFIRMA el fallo: sin Tavus no había videollamada con
# IA, y una conversación del motor propio no tenía sala.
#
# Uso:  scripts/banco-proveedor-propio-de-videollamada.sh
#       MODO=roto scripts/banco-proveedor-propio-de-videollamada.sh
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${MODO:-bueno}"; export MODO
# 2f3633e — antes de esto: la videollamada con IA solo existía con Tavus.
ANTES_REF="${ANTES_REF:-2f3633e}"
if [ "$MODO" = roto ]; then
  ARBOL="$(mktemp -d)/sala"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  trap 'git worktree remove --force "$ARBOL" 2>/dev/null || true' EXIT
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DE_LA_SALA="$ARBOL"
fi
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node --test lib/__tests__/proveedor-propio-de-videollamada.test.mjs
