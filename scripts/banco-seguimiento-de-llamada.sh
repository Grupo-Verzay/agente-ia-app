#!/usr/bin/env bash
# El banco del seguimiento «Llamada con IA».
#
# La decision, sin navegador y en los dos modos. El modo roto es como se sacaba
# el tipo base antes —`tipo.split('-')[1]`— y **afirma el fallo**: de
# `seguimiento-ai-call` sale `ai`, un tipo que no existe, asi que la tarjeta se
# caia al caso por defecto y pedia subir un archivo. Sin ese modo, lo verde del
# normal no probaria que se arreglo la causa.
#
# Y comprueba ademas que el nodo esta en las DOS paletas y en el catalogo por
# plan: el fallo de esta familia es que a una hermana se le pasa.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"

# `--ignoreConfig` solo existe en TypeScript 6: sin el, la 6 se niega a
# compilar un fichero suelto habiendo un tsconfig al lado (TS5112); con el, la
# 5 no lo reconoce (TS5023). Asi que se pregunta la version en vez de escribir
# una de las dos a mano — el banco corre con la del repositorio y con la que
# traiga `npx` un dia que las dependencias no esten instaladas.
MAYOR="$(npx tsc --version | sed -E 's/^Version ([0-9]+).*/\1/')"
SIN_CONFIG=""
if [ "${MAYOR:-0}" -ge 6 ]; then SIN_CONFIG="--ignoreConfig"; fi

npx tsc lib/seguimiento-de-llamada.ts --outDir lib/__tests__/.compilado/seguimiento \
  --module es2022 --target es2022 --lib es2022,dom \
  --moduleResolution bundler --skipLibCheck $SIN_CONFIG

echo "── la decisión, con el prefijo quitado ENTERO ──"
node --test lib/__tests__/seguimiento-de-llamada.test.mjs

echo
echo '── la decisión, con el split("-")[1] de ANTES (afirma el fallo) ──'
MODO=roto node --test lib/__tests__/seguimiento-de-llamada.test.mjs
