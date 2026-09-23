#!/usr/bin/env bash
# El banco de la ANIMACIÓN de los paneles laterales de Chats.
#
# Lo que se reportó: la ficha de Contacto entraba «empujada y frenada de golpe»
# —era un hermano del flex que se montaba y desmontaba en un fotograma— y los
# demás (notas, recordatorio, tarea, contexto, copiloto, equipo) se deslizaban.
# Y al alternar entre dos paneles, el que salía se deslizaba hacia fuera
# mientras el que entraba se deslizaba hacia dentro: un reinicio en cada cambio.
#
# Tres mitades:
#
#   1. La DECISIÓN, pura (`comoSeMueveLaHoja`): desliza con la franja vacía,
#      relevo sin transición cuando otro ocupa el sitio.
#   2. Un BARRIDO del código real: la ficha va en `PanelLateral`, chat-main ya
#      no la monta con un `&&`, y los seis paneles comparten duración, curva,
#      ancho y anclaje —y aplican `HOJA_SIN_TRANSICION` en un relevo—.
#   3. En CHROMIUM, sobre el CSS del build y con la ficha REAL
#      (`ContactInfoPanel`, con sus acciones de servidor mudas) y el
#      `PanelLateral` real, muestreando fotograma a fotograma.
#
# `MODO=roto` construye con el código de ANTES_REF (pinchado: `origin/main` se
# convierte en el «ahora» en cuanto esto se fusiona) y AFIRMA los fallos: la
# ficha aparece sin deslizarse, empuja la conversación de golpe, y al relevar
# el panel nuevo entra deslizándose.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-093f071}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY=".banco-animacion-de-paneles-entry.tsx"
OUT="lib/__tests__/.compilado/harness-animacion-de-paneles.js"
FICHA_ANTES="app/(root)/chats/_components/.ContactInfoPanel-antes.tsx"
PANEL_ANTES="components/shared/.PanelLateral-antes.tsx"
HOOK_ANTES="hooks/.usePanelLateral-antes.ts"
LIB_ANTES="lib/.panel-lateral-antes.ts"
trap 'rm -f "$ENTRY" "$FICHA_ANTES" "$PANEL_ANTES" "$HOOK_ANTES" "$LIB_ANTES"' EXIT

FICHA="@/app/(root)/chats/_components/ContactInfoPanel"
PANEL="@/components/shared/PanelLateral"
HOOK="@/hooks/usePanelLateral"
if [ "$MODO" = "roto" ]; then
  # Cada fichero del «antes» junto a sus vecinos de hoy, para que sus `./`
  # resuelvan; lo único que se reescribe son los imports entre ellos.
  git show "$ANTES_REF:lib/panel-lateral.ts" > "$LIB_ANTES"
  git show "$ANTES_REF:hooks/usePanelLateral.ts" | sed 's#@/lib/panel-lateral#@/lib/.panel-lateral-antes#' > "$HOOK_ANTES"
  git show "$ANTES_REF:components/shared/PanelLateral.tsx" \
    | sed 's#@/lib/panel-lateral#@/lib/.panel-lateral-antes#; s#@/hooks/usePanelLateral#@/hooks/.usePanelLateral-antes#' > "$PANEL_ANTES"
  git show "$ANTES_REF:app/(root)/chats/_components/ContactInfoPanel.tsx" > "$FICHA_ANTES"
  FICHA="@/app/(root)/chats/_components/.ContactInfoPanel-antes"
  PANEL="@/components/shared/.PanelLateral-antes"
  HOOK="@/hooks/.usePanelLateral-antes"
fi

cat > "$ENTRY" <<'TSX'
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import * as Ficha from "__FICHA__";
import { PanelLateral } from "__PANEL__";
import { usePanelLateral } from "__HOOK__";
import { PANEL_DEL_RECORDATORIO } from "@/lib/panel-lateral";

const ROTO = new URLSearchParams(location.search).get("modo") === "roto";
const FICHA = "panel-ficha-de-contacto";
const sesion: any = { id: 1, userId: "u1", remoteJid: "573001112233@s.whatsapp.net", agentDisabled: false };

function LaFicha({ abierta, cerrar }: { abierta: boolean; cerrar: () => void }) {
    const props = {
        session: sesion, displayedContactName: "Yair Silvera", displayedWhatsapp: "+57 300 111 2233",
        userId: "u1", remoteJid: sesion.remoteJid, notesCount: 0, advisors: [],
        onClose: cerrar, onSessionMutate: () => {}, onSessionRefresh: async () => {},
    };
    if (!ROTO) return <Ficha.ContactInfoPanel {...(props as any)} abierto={abierta} />;
    // El «antes»: un hermano del flex montado con un `&&`, en la exclusión sin reservar.
    (usePanelLateral as any)(FICHA, abierta, cerrar, { reservar: false });
    return abierta ? <Ficha.ContactInfoPanel {...(props as any)} /> : null;
}

function Maqueta() {
    const [ficha, setFicha] = useState(false);
    const [recordatorio, setRecordatorio] = useState(false);
    (window as any).abrir = (cual: string, v: boolean) => (cual === "ficha" ? setFicha(v) : setRecordatorio(v));
    return (
        <div className="flex h-screen flex-col">
            <div className="h-16 shrink-0 border-b" />
            <div className="flex min-h-0 flex-1">
                <nav className="w-12 shrink-0 border-r" />
                <aside className="w-[var(--ancho-lateral)] shrink-0 border-r" />
                <div data-chat-view className="flex min-w-0 flex-1">
                    {/* Como chat-main: la conversación y, a su lado, la ficha. */}
                    <div className="relative flex h-full w-full min-w-[100px] overflow-hidden">
                        <section id="conversacion" className="flex min-w-0 flex-1 flex-col md:min-w-[15rem]" />
                        <LaFicha abierta={ficha} cerrar={() => setFicha(false)} />
                    </div>
                </div>
            </div>
            <PanelLateral id={PANEL_DEL_RECORDATORIO} abierto={recordatorio} onCerrar={() => setRecordatorio(false)} titulo="Crear recordatorio">
                <div className="p-4">Recordatorio</div>
            </PanelLateral>
        </div>
    );
}

createRoot(document.getElementById("app")!).render(<Maqueta />);
(window as any).listo = true;
TSX

sed -i "s#__FICHA__#${FICHA}#; s#__PANEL__#${PANEL}#; s#__HOOK__#${HOOK}#" "$ENTRY"

node scripts/empaquetar-con-acciones-mudas.mjs "$ENTRY" "$OUT"

# La decisión pura, del árbol de hoy (en modo roto el test lee el «antes» con git).
npx esbuild lib/panel-lateral.ts --format=esm --outfile=lib/__tests__/.compilado/panel-lateral.mjs --log-level=error

node --test lib/__tests__/animacion-de-paneles.test.mjs "$@"
