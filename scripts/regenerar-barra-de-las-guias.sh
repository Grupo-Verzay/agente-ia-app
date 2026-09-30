#!/usr/bin/env bash
# Rehace SOLO la foto de la barra de arriba (`barra-de-arriba.webp`) de TODAS
# las guías publicadas, cuando la barra gana o pierde un botón —como «Ayuda»—.
# Sin volver a generar ninguna guía entera: ni sus capturas, ni sus
# miniaturas, ni su vídeo.
#
# Levanta la App sembrada con el lanzador de siempre (`generar-guia.sh`, sobre
# la semilla de Leads: el marco —la cuenta de un cliente, su menú y la barra—
# es el mismo en todas las guías) y abre la pantalla de cada una
# (`GUIAS_PUBLICADAS`) para fotografiar su barra con la receta del taller.
#
# Uso:  npm run build && scripts/regenerar-barra-de-las-guias.sh && npm run build
#       SOLO=leads,catalogo scripts/regenerar-barra-de-las-guias.sh
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"

C=lib/__tests__/.compilado/barra-de-las-guias
mkdir -p "$C"
npx -y esbuild lib/tutoriales-del-modulo.ts --bundle --platform=node --format=esm --outfile="$C/tutoriales-del-modulo.mjs" --log-level=warning
npx -y esbuild lib/guia-de-modulo.ts --bundle --platform=node --format=esm --outfile="$C/guia-de-modulo.mjs" --log-level=warning

SIN_VIDEO=1 CAPTURAR=scripts/regenerar-barra-de-las-guias.mjs scripts/generar-guia.sh leads
