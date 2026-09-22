#!/usr/bin/env bash
# El banco de «Application error: a client-side exception has occurred».
#
# Esa pantalla en blanco es la `GlobalError` de Next
# (`node_modules/next/dist/client/components/error-boundary.js:149`), que el
# router monta POR ENCIMA del layout raiz. El repositorio no tenia ni
# `app/global-error.tsx` ni `app/error.tsx`, y el `ErrorBoundary` de Next
# devuelve un Fragment pelado cuando no le dan `errorComponent`: la App corria
# con CERO limites del App Router.
#
# El limite propio —la clase de `components/error-bundary.tsx`— vive DENTRO de
# `app/layout.tsx`, o sea por debajo del global. Medido: caza todo lo que
# revienta dentro de `{children}`. Asi que lo reportado venia de mas ARRIBA,
# y `FontScaleApplier` y `StoragePersistence` estaban montados fuera de el.
#
# Uso:  scripts/banco-pantalla-en-blanco.sh
#       MODO=roto scripts/banco-pantalla-en-blanco.sh
#
# El modo roto lee `app/layout.tsx` de `origin/main` con `git show` y AFIRMA el
# fallo: encuentra exactamente esos dos componentes por encima del limite. Sin
# ese modo, lo verde del normal no diria si el barrido mira o si el caso no se
# llega a ejercer.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"

echo "== se compila el modulo que el banco importa =="
npx esbuild lib/fallos-del-navegador.ts --format=esm --outdir=lib/__tests__/.compilado

echo
echo "== la decision, sin navegador =="
node --test lib/__tests__/fallos-del-navegador.test.mjs

echo
echo "== y el modo roto, que afirma el fallo sobre origin/main =="
MODO=roto node --test lib/__tests__/fallos-del-navegador.test.mjs

echo
echo "TODO EN VERDE"
