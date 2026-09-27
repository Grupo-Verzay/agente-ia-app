import React from "react";
import { createRoot } from "react-dom/client";
import { CorreoClient } from "@/app/(root)/correo/_components/CorreoClient";
import { ChatSearchBar } from "@/app/(root)/chats/_components/ChatSearchBar";
import { ChatTabBar } from "@/app/(root)/chats/_components/ChatTabBar";

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
 * La cabecera de la columna de CHATS, con sus componentes de verdad: el
 * selector de canales y la fila de pastillas. Se pinta en la misma página que
 * Correo para medir los dos con la MISMA hoja y compararlos, no contra números
 * escritos a mano.
 */
(window as any).maquetaChats = () => {
    const nodo = document.createElement("div");
    nodo.id = "chats";
    nodo.setAttribute("data-columna-de-chats", "");
    nodo.style.cssText = "position:absolute;left:0;top:0;width:384px;visibility:hidden";
    document.body.appendChild(nodo);
    createRoot(nodo).render(
        <div data-cabecera-de-la-columna className="flex flex-col gap-1 p-1.5">
            <ChatSearchBar
                value=""
                onChange={() => {}}
                onClear={() => {}}
                channels={[{ instanceName: "VENTAS" }, { instanceName: "ATENCION" }]}
                channelCounts={{ VENTAS: 3, ATENCION: 1 }}
                selectedChannel={null}
                onChannelChange={() => {}}
            />
            <ChatTabBar
                tab="all"
                onTabChange={() => {}}
                tabCounts={{ all: 4, mine: 0, archived: 0, resolved: 0 } as any}
                unreadOnly={false}
                onToggleUnread={() => {}}
                unreadCount={2}
            />
        </div>,
    );
};
(window as any).listo = true;
