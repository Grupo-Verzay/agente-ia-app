#!/usr/bin/env bash
# El banco del CUPO DE LLAMADAS SIMULTÁNEAS, del lado de la App.
#
# Lo que prueba: que TODA salida de la tarjeta de llamada pasa por `hangup()`,
# que es la única puerta que le dice al proveedor que la llamada acabó. Cada
# camino que se iba por `cleanup()` a secas dejaba un sitio del cupo ocupado
# por una llamada que ya no existe — y a la octava vez la tarjeta contestaba
# «Límite de llamadas simultáneas alcanzado» sin que hubiera nadie hablando.
#
# MODO=roto lee la MISMA tarjeta del commit de antes (`ANTES_REF`) y afirma el
# fallo: seis guardianes de cancelación abandonaban llamadas ya creadas y cinco
# salidas soltaban el micro sin avisar al servidor.
#
# La otra mitad está en el repositorio de astracalls
# (`scripts/banco-cupo-de-llamadas.sh`): allí se prueba que el servidor libera
# el sitio aunque este aviso no llegue nunca, que es lo que hace que el cupo se
# recupere también cuando la pestaña se cierra de golpe.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== modo bueno =="
node --test lib/__tests__/cupo-de-llamadas.test.mjs

echo
echo "== MODO ROTO (tiene que ponerse ROJO) =="
if MODO=roto node --test lib/__tests__/cupo-de-llamadas.test.mjs >/dev/null 2>&1; then
  echo "FALLO DEL BANCO: el modo roto pasó. Un modo roto que pasa no está en verde, está muerto."
  exit 1
fi
echo "OK: el modo roto reproduce el fallo."
