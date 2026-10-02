#!/usr/bin/env bash
# El MENÚ DEL PASO del entrenamiento, en Chromium, en las cuatro pestañas
# REALES: Inicio, Preguntas, Productos y Extras.
#
# Exige que «Agregar acción» ofrezca exactamente lo mismo en las cuatro —los
# mismos grupos y opciones, en el mismo orden, con «Agregar caso» y «Agregar
# transición»— y que las dos tarjetas salgan con los mismos campos.
#
# `MODO=roto` monta las pestañas de `ANTES_FUERA_REF` (pinchado, nunca
# `origin/main`) y AFIRMA el fallo: solo Inicio los ofrecía.
set -euo pipefail
cd "$(dirname "$0")/.."

export MODO="${MODO:-bueno}"
# 8958372 — #1100 fusionado: caso y transición solo en Inicio.
ANTES_FUERA_REF="${ANTES_FUERA_REF:-8958372}"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

RAIZ="$(pwd)"
OUT="$RAIZ/lib/__tests__/.compilado/menu-del-paso"
mkdir -p "$OUT"
ENTRADA=lib/__tests__/menu-del-paso/entrada.tsx

ARBOL=""
limpiar() { if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi; }
trap limpiar EXIT

if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach "$ARBOL" "$ANTES_FUERA_REF" >/dev/null
  ln -s "$RAIZ/node_modules" "$ARBOL/node_modules"
  mkdir -p "$ARBOL/$(dirname "$ENTRADA")"
  cp "$ENTRADA" "$ARBOL/$ENTRADA"
  (cd "$ARBOL" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" "$ENTRADA" "$OUT/harness.js")
else
  node scripts/empaquetar-con-acciones-mudas.mjs "$ENTRADA" "$OUT/harness.js"
fi

echo "── Menú del paso (MODO=$MODO, antes=$ANTES_FUERA_REF) ──"
node --test lib/__tests__/menu-del-paso.test.mjs "$@"
