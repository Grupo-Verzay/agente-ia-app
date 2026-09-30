#!/usr/bin/env bash
# El banco de la BARRA DEL PANEL en Documentación.
#
# Documentación (`/documentation`) es un apartado del panel, igual que Embudos
# (`/embudos`): los dos viven fuera de `/panel` y la barra de pestañas se la
# pone el layout raíz por ser una pestaña del panel. Documentación se quedaba
# sin ella por una lista de excepciones (`RUTAS_SIN_PESTANAS`).
#
# Pinta el `PanelAwareTabNav` REAL (react-dom/server, sin Next) con las
# pestañas del panel tal como están en producción y comprueba, ruta por ruta,
# que Documentación y todas sus pantallas llevan la barra —con su pestaña
# marcada— igual que Embudos, y que fuera de los apartados no sale.
#
# `MODO=roto` pinta el componente de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y AFIRMA el fallo: Embudos con barra y Documentación sin ella.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"; export MODO
ANTES_REF="${ANTES_REF:-675dcee}"
OUT=lib/__tests__/.compilado/barra-del-panel
mkdir -p "$OUT"

npx esbuild lib/barra-del-panel.ts --bundle --platform=node --format=esm --outdir="$OUT" --log-level=error

ALIAS=(--alias:next/navigation=./lib/__tests__/fingido/next-navigation-ssr.ts
       --alias:next/link=./lib/__tests__/fingido/next-link-ssr.tsx)
if [ "$MODO" = "roto" ]; then
  ANTES=lib/__tests__/.antes/barra-del-panel
  mkdir -p "$ANTES"
  git show "$ANTES_REF:components/custom/PanelAwareTabNav.tsx" > "$ANTES/PanelAwareTabNav.tsx"
  git show "$ANTES_REF:lib/pantallas-sin-pestanas.ts" > "$ANTES/pantallas-sin-pestanas.ts"
  ALIAS+=(--alias:@/components/custom/PanelAwareTabNav=./$ANTES/PanelAwareTabNav.tsx
          --alias:@/lib/pantallas-sin-pestanas=./$ANTES/pantallas-sin-pestanas.ts)
fi
npx esbuild lib/__tests__/fingido/entrada-barra-del-panel.tsx --bundle --platform=node --format=esm \
  --jsx=automatic --outfile="$OUT/entrada.mjs" --log-level=error "${ALIAS[@]}" \
  --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);"

node --test lib/__tests__/barra-del-panel.test.mjs
