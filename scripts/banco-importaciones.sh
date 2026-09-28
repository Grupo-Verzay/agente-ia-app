#!/usr/bin/env bash
# Banco: lo que se importa por nombre entre ficheros del repo existe donde se
# importa. Es el fallo que tumbó el despliegue del #1000: dos PR que compilaban
# por separado (#998 y #999) y juntos no. Dos modos: el bueno sobre el árbol de
# trabajo, y el roto sobre el commit que se fusionó roto (REF_ROTA, pinchado),
# que AFIRMA que el banco lo caza.
set -euo pipefail
cd "$(dirname "$0")/.."
node --test lib/__tests__/importaciones-que-existen.test.mjs
MODO=roto node --test lib/__tests__/importaciones-que-existen.test.mjs
