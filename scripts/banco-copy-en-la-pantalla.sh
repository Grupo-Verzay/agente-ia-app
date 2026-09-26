#!/usr/bin/env bash
# El texto del post, EN LA PANTALLA: que aparece junto a la vista previa
# después de generar, que sigue a la red que se elige ahí, que se edita, que se
# copia y que se vuelve a generar.
#
# Va en Chromium y con el `AdGeneratorStudio` de VERDAD —subiendo un producto y
# pulsando «Generar imagen»— porque ninguna de esas preguntas se contesta
# leyendo el código: que el copy de la vista que se ve sea el de SU red depende
# de que la llave del texto y la de la imagen sean la misma, y eso solo se ve
# con las dos pintadas una al lado de la otra.
#
# Lo único fingido son las acciones de servidor: la imagen vuelve como un PNG de
# un píxel y el copy con un texto distinto por red y por vuelta, que es lo que
# permite afirmar que el panel sigue al formato y que «volver a generar»
# cambia el texto.
#
# `MODO=roto` monta el estudio de ANTES —sacado con `git show` a una carpeta
# HERMANA de `_components`, para que sus imports relativos resuelvan igual— y
# AFIRMA el fallo: la pantalla genera la imagen y no hay ningún texto.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` sería el «ahora» y el modo roto pasaría sin reproducir
# nada. Ya le pasó a tres bancos de este repositorio.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
# 121e369 — antes de esto: AI imágenes generaba la imagen y el texto del post
#           había que escribirlo a mano.
ANTES_REF="${ANTES_REF:-121e369}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY=".banco-copy-pantalla-entry.tsx"
ANTES_DIR="app/(root)/ai-image/_banco_antes"
trap 'rm -rf "$ENTRY" "$ANTES_DIR"' EXIT

if [ "$MODO" = "roto" ]; then
  # Hermana de `_components`, no dentro: los componentes se importan entre
  # ellos con `./`, así que el «antes» se lleva el árbol entero de esa carpeta.
  mkdir -p "$ANTES_DIR"
  for f in $(git ls-tree -r --name-only "$ANTES_REF" "app/(root)/ai-image/_components"); do
    destino="$ANTES_DIR/${f#app/(root)/ai-image/_components/}"
    mkdir -p "$(dirname "$destino")"
    git show "$ANTES_REF:$f" > "$destino"
  done
  DESDE="@/app/(root)/ai-image/_banco_antes/AdGeneratorStudio"
else
  DESDE="@/app/(root)/ai-image/_components/AdGeneratorStudio"
fi

cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { AdGeneratorStudio } from "$DESDE";

(window as any).pintar = () => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("pantalla")!));
    raiz.render(React.createElement(AdGeneratorStudio as any, { hasGoogleKey: true, dbStyles: [] }));
};
(window as any).listo = true;
TSX

node scripts/empaquetar-con-acciones-mudas.mjs \
  "$ENTRY" lib/__tests__/.compilado/harness-copy-pantalla.js \
  --alias:@/actions/ai-image-actions=./lib/__tests__/fingido/acciones-de-ai-image.ts \
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-mudo.ts \
  --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts

echo "── El texto del post en la pantalla (MODO=$MODO) ──"
node --test lib/__tests__/copy-en-la-pantalla.test.mjs "$@"
