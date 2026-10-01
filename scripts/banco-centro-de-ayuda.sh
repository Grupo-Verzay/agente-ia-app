#!/usr/bin/env bash
# El CENTRO DE AYUDA: el botón «Ayuda» de la barra de arriba (justo antes de
# «Soporte», al lado de «Ver tutoriales», que sigue igual), la portada `/ayuda`
# con su buscador y las diez categorías —una por grupo del menú lateral—, y la
# lista de cada categoría con la MISMA fila de Documentación › Guías, sin
# administración.
#
# Dos mitades:
#  1. Sin navegador (`centro-de-ayuda.test.mjs`): las diez categorías contra el
#     menú de un cliente, cada guía publicada en su categoría SOLA (por la ruta
#     de su pantalla), el buscador, y un barrido del código: sin «Nuevo», sin
#     «Editar introducción», sin arrastrar; la barra con Ayuda antes de Soporte;
#     y las guías con la barra de arriba fotografiada con sus siete partes.
#  2. En Chromium, sobre el CSS del build (`centro-de-ayuda-navegador.test.mjs`),
#     las pantallas de VERDAD a 1440/1280/1024/390.
#
# `MODO=roto` lee y monta el código de `ANTES_REF` —pinchado a un commit, nunca
# `origin/main`— y afirma que no había nada de esto; y la portada de
# `ANTES_DEL_CENTRADO`, y afirma el título a la izquierda y el buscador de lado
# a lado.
#
# Necesita el build (`npm run build`) para el CSS.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-fd8b831}"
export ANTES_REF
# La portada antes de centrarla: el centro de ayuda ya existía, con el título
# a la izquierda y el buscador de lado a lado.
ANTES_DEL_CENTRADO="${ANTES_DEL_CENTRADO:-38be58b}"
export ANTES_DEL_CENTRADO

C=lib/__tests__/.compilado/centro-de-ayuda
A=lib/__tests__/.antes/centro-de-ayuda
mkdir -p "$C" "$A"
trap 'rm -rf "$A"' EXIT

COMUNES=(
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-con-ruta.ts
  --alias:@/actions/guide-actions=./lib/__tests__/fingido/tutoriales/guias.ts
  --alias:@/actions/notification-center-actions=./lib/__tests__/fingido/barra-de-arriba/campana.ts
  --alias:@/actions/tickets-actions=./lib/__tests__/fingido/centro-de-ayuda/tickets.ts
)

# Las guías y las categorías: las de hoy en los dos modos (lo que cambia en el
# roto es cómo se pintan, no qué llevan).
for m in centro-de-ayuda guias-del-centro-de-ayuda tutoriales-del-modulo guia-de-modulo; do
  npx -y esbuild "lib/$m.ts" --bundle --platform=node --format=esm --outfile="$C/$m.mjs" --log-level=warning
done

if [ "$MODO" = "roto" ]; then
  git show "$ANTES_DEL_CENTRADO:components/ayuda/CentroDeAyuda.tsx" > "$A/CentroDeAyuda.tsx"
  git show "$ANTES_DEL_CENTRADO:components/documentacion/CabeceraDeDocumentacion.tsx" > "$A/CabeceraDeDocumentacion.tsx"
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/centro-de-ayuda/entrada.tsx "$C/centro-antes.js" "${COMUNES[@]}" \
    "--alias:@/components/ayuda/CentroDeAyuda=./$A/CentroDeAyuda.tsx" \
    "--alias:@/components/documentacion/CabeceraDeDocumentacion=./$A/CabeceraDeDocumentacion.tsx"
  git show "$ANTES_REF:components/custom/Breadcrumbs.tsx" \
    | sed "s#from '\.\./ui/#from '@/components/ui/#; s#from '\./ThemeSwitcher'#from '@/components/custom/ThemeSwitcher'#" > "$A/Breadcrumbs.tsx"
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/barra-de-arriba/entrada.tsx "$C/barra-antes.js" \
    "${COMUNES[@]}" "--alias:@/components/custom/Breadcrumbs=./$A/Breadcrumbs.tsx"
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/centro-de-ayuda/entrada.tsx "$C/centro.js" "${COMUNES[@]}"
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/barra-de-arriba/entrada.tsx "$C/barra-hoy.js" "${COMUNES[@]}"
fi

node --test lib/__tests__/centro-de-ayuda.test.mjs lib/__tests__/centro-de-ayuda-navegador.test.mjs
