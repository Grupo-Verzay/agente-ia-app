#!/usr/bin/env bash
# El banco de la tarjeta del tablero de Proyectos.
#
# El adjunto va INLINE en la fila del responsable, no en un renglón `<p>` propio,
# así que la tarjeta mide lo MISMO lo lleve o no —y las de una misma columna
# dejan de quedar disparejas—. Es el mismo patrón que la tarjeta de Tickets.
#
# Es un banco de Chromium sobre el CSS del build, con el componente REAL. **No
# toca Postgres**: la tarjeta es pura, solo pinta. Corre en DOS modos: en
# `MODO=roto` la tarjeta se saca de `origin/main` —donde el adjunto era un
# renglón aparte y la tarjeta crecía— con `git show`, no de una copia escrita
# aquí, y el banco afirma esa reaparición. Sin ese modo, lo verde no diría si se
# arregló la causa o si el caso no se ejerce.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

COMP="app/(root)/proyectos/_components"
ANTES="app/(root)/proyectos/.banco-antes"
ENTRY=".banco-tarjeta-de-proyecto-entry.tsx"
OUT="lib/__tests__/.compilado/harness-tarjeta-de-proyecto.js"
mkdir -p "$(dirname "$OUT")"
trap 'rm -rf "$ANTES" "$ENTRY"' EXIT

if [ "$MODO" = "roto" ]; then
  # El «antes» sale de `origin/main`, no de una copia escrita aquí. Allí la
  # tarjeta (`TaskCard`) vivía DENTRO de `ProjectBoard`, con el adjunto en su
  # propio `<p>`. Se extrae solo esa función y se le pone una cabecera de
  # imports —todas puras—, así que el modo roto mide el componente que había, no
  # lo que alguien recuerde de él.
  mkdir -p "$ANTES"
  git fetch origin main --quiet 2>/dev/null || true
  cat > "$ANTES/TarjetaDeProyecto.tsx" <<'HDR'
"use client";
import { Paperclip, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DistintivoDeVencimiento } from "@/components/shared/DistintivoDeVencimiento";
import type { TaskData } from "@/lib/task-types";
import { textoCompletoDeLaTarea, tituloDeLaTarjeta } from "@/lib/titulo-de-la-tarea";
HDR
  git show "origin/main:$COMP/ProjectBoard.tsx" \
    | awk '/^function TaskCard\(/{f=1} /^function DraggableTask\(/{f=0} f' \
    | sed 's/^function TaskCard(/export function TaskCard(/' \
    >> "$ANTES/TarjetaDeProyecto.tsx"
  DESDE="@/app/(root)/proyectos/.banco-antes/TarjetaDeProyecto"
else
  DESDE="@/$COMP/TarjetaDeProyecto"
fi

# El arnés arma la tarjeta dentro del navegador. `TaskData` no lleva funciones,
# así que el objeto se puede pasar tal cual por `page.evaluate`.
cat > "$ENTRY" <<TSX
import React from "react";
import { createRoot } from "react-dom/client";
import { TaskCard } from "$DESDE";

(window as any).pintar = (task: any, ahora: number) => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("tarjeta")!));
    raiz.render(React.createElement(TaskCard as any, { task, ahora, dragging: false }));
};

(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT" \
  --alias:@="$(pwd)" \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

rm -f "$ENTRY"
rm -rf "$ANTES"

node --test lib/__tests__/tarjeta-de-proyecto.test.mjs "$@"
