import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatRegistrosSheet } from "@/app/(root)/chats/_components/ChatRegistrosSheet";
import { ChatAppointmentStatusButton } from "@/app/(root)/chats/_components/ChatAppointmentStatusButton";
import { NotificationCenter } from "@/components/shared/NotificationCenter";
import { MARCA_DE_LA_BARRA, MARCA_DE_LA_CABECERA } from "@/hooks/usePanelFlotante";

/**
 * La maqueta del banco: la barra de arriba con la campanita REAL a la derecha
 * (como en `Breadcrumbs`: `pl-4 pr-3`), una cabecera de conversación con la
 * ficha de la cita REAL, y el diálogo de Registros REAL. Lo único fingido son
 * las acciones de servidor.
 */
function Maqueta() {
    const [registros, setRegistros] = useState(false);
    return (
        <div className="flex h-screen flex-col">
            <header
                {...{ [MARCA_DE_LA_BARRA]: "" }}
                className="sticky top-0 flex h-16 w-full shrink-0 items-center border-b border-border bg-background pl-4 pr-3"
            >
                <span className="flex-1 text-sm">Inicio / Chats</span>
                <NotificationCenter />
            </header>
            <div className="flex min-h-0 flex-1">
                <aside className="w-72 shrink-0 border-r" />
                <section className="flex min-w-0 flex-1 flex-col">
                    <div {...{ [MARCA_DE_LA_CABECERA]: "" }} className="shrink-0 border-b">
                        <div className="flex h-12 items-center gap-1 px-3">
                            <span className="flex-1 truncate text-sm">Marta Restrepo</span>
                            <ChatAppointmentStatusButton
                                sessionId={1}
                                userId="u1"
                                pushName="Marta"
                                remoteJid="573001112233@s.whatsapp.net"
                                instanceId="i1"
                            />
                            <button
                                type="button"
                                data-abrir-registros=""
                                className="h-7 rounded-md border px-2 text-xs"
                                onClick={() => setRegistros(true)}
                            >
                                Registros
                            </button>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1" />
                </section>
            </div>
            <ChatRegistrosSheet
                open={registros}
                onOpenChange={setRegistros}
                sessionId={1}
                sessionPushName="Marta Restrepo"
                whatsapp="573001112233"
                userId="u1"
                remoteJid="573001112233@s.whatsapp.net"
                instanceId="i1"
            />
        </div>
    );
}

createRoot(document.getElementById("app")!).render(<Maqueta />);
(window as any).listo = true;
