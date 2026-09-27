import React from "react";
import { createRoot } from "react-dom/client";
import { CorreoClient } from "@/app/(root)/correo/_components/CorreoClient";
import { ChatSearchBar } from "@/app/(root)/chats/_components/ChatSearchBar";
import { ChatTabBar } from "@/app/(root)/chats/_components/ChatTabBar";
import { TagFilterPanel } from "@/app/(root)/chats/_components/TagFilterPanel";
import { BotonDeAsesores, BotonDeGrupos } from "@/app/(root)/chats/_components/BotonesDeLaBarra";
import { cn } from "@/lib/utils";
import {
    ALTO_DE_LA_CABECERA_DE_LA_COLUMNA,
    CABECERA_DE_LA_COLUMNA,
    CABECERA_ESCRITORIO,
    CLASE_FILA_1,
    CLASE_FILA_2,
    FILA_1_DE_LA_COLUMNA,
    FILA_2_DE_LA_COLUMNA,
} from "@/lib/cabeceras-de-chats";

(window as any).maqueta = () => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("app")!));
    raiz.render(
        // El hueco de un módulo: alto fijo, y el contenido se reparte dentro.
        <div style={{ height: "calc(100vh - 16px)", padding: 8 }}>
            <CorreoClient conectado={null} error={(window as any).__error ?? null} />
        </div>,
    );
};

/**
 * La cabecera de la columna de CHATS, con sus componentes de verdad y las
 * MISMAS clases que `chat-sidebar`: el selector de canales, el buscador, el
 * embudo, los dos iconos y la fila de pastillas. Se pinta en la misma página
 * que Correo, con el ancho de la columna (`--ancho-lateral`), para medir las
 * dos cabeceras con la MISMA hoja y compararlas pieza por pieza, no contra
 * números escritos a mano.
 */
(window as any).maquetaChats = () => {
    const nodo = document.createElement("div");
    nodo.id = "chats";
    nodo.setAttribute("data-columna-de-chats", "");
    nodo.style.cssText = "position:absolute;left:0;top:0;width:var(--ancho-lateral);visibility:hidden";
    document.body.appendChild(nodo);
    const nada = () => {};
    // La columna de Chats lleva su raya a la derecha (`sm:border-r` del
    // `aside` de `chat-sidebar`), y la cabecera va dentro: la mide.
    createRoot(nodo).render(
        <div className="border-border sm:border-r">
        <div data-cabecera-de-la-columna className={cn(CABECERA_DE_LA_COLUMNA, ALTO_DE_LA_CABECERA_DE_LA_COLUMNA, CABECERA_ESCRITORIO)}>
            <div data-fila-del-buscador className={cn(FILA_1_DE_LA_COLUMNA, CLASE_FILA_1)}>
                <ChatSearchBar
                    value=""
                    onChange={nada}
                    onClear={nada}
                    channels={[{ instanceName: "VENTAS" }, { instanceName: "ATENCION" }]}
                    channelCounts={{ VENTAS: 3, ATENCION: 1 }}
                    selectedChannel={null}
                    onChannelChange={nada}
                />
                <TagFilterPanel
                    tags={[]}
                    selectedTagIds={new Set<number>()}
                    onToggleTag={nada}
                    onClearFilter={nada}
                    rangoDesde=""
                    rangoHasta=""
                    campoDeFecha="inicio"
                    rangoActivo={false}
                    onRangoDesde={nada}
                    onRangoHasta={nada}
                    onCampoDeFecha={nada}
                    onLimpiarRango={nada}
                />
                <BotonDeAsesores />
                <BotonDeGrupos />
            </div>
            <div data-fila-de-filtros className={cn(FILA_2_DE_LA_COLUMNA, CLASE_FILA_2)}>
                <ChatTabBar
                    tab="all"
                    onTabChange={nada}
                    tabCounts={{ all: 4, mine: 0, archived: 0, resolved: 0 } as any}
                    unreadOnly={false}
                    onToggleUnread={nada}
                    unreadCount={2}
                />
            </div>
        </div>
        </div>,
    );
};
(window as any).listo = true;
