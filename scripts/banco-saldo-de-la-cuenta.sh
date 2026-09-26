#!/usr/bin/env bash
# El banco de «la llamada sale y la transcripción dice que quedan 0».
#
# Todo lo que corre aquí es PURO —la regla del saldo, lo que se decide con él y
# el corte del audio— más un barrido del código, que es lo único que puede
# afirmar que las cuatro pantallas que transcriben van por la misma puerta.
#
# Lo que NO se puede probar sin base —a qué cuenta se le cobra de verdad, que
# la marca queda escrita en la fila— vive en `scripts/banco-grabacion-de-llamada.sh`,
# que levanta su Postgres y ejerce las acciones.
#
#   MODO=roto scripts/banco-saldo-de-la-cuenta.sh   <- afirma el fallo
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"

# Un paquete y no `tsc`: estos módulos se importan entre ellos con `@/lib/...`
# y `tsc` a secas deja esas rutas sin resolver, así que el banco se caería con
# un «Cannot find module» que no se parece en nada a lo que prueba.
npx esbuild lib/__tests__/fingido/entrada-del-saldo.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/saldo \
  --log-level=error

node --test lib/__tests__/saldo-de-la-cuenta.test.mjs "$@"

# Y las tres suites que ya existían sobre estas mismas reglas. Estaban sin
# script —se compilaban a mano con un `tsc` que dejó de servir en cuanto estos
# módulos empezaron a importarse entre ellos— así que aquí se quedan, corriendo.
npx esbuild lib/transcripcion-de-voz.ts lib/nota-de-voz-del-equipo.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado \
  --log-level=error
npx esbuild lib/grabacion-de-reunion.ts lib/transcripcion-de-voz.ts lib/reconexion-de-la-sala.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/lib \
  --log-level=error

node --test \
  lib/__tests__/transcripcion-de-voz.test.mjs \
  lib/__tests__/nota-de-voz-del-equipo.test.mjs \
  lib/__tests__/grabacion-de-reunion.test.mjs "$@"
