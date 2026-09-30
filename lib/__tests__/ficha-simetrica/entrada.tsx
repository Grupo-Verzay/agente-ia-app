import React from "react";
import { createRoot } from "react-dom/client";
import { ContactFieldsConfigDialog } from "@/app/(root)/chats/_components/ContactFieldsConfigDialog";
import { ContactInfoPanel } from "@/app/(root)/chats/_components/ContactInfoPanel";

/**
 * La maqueta del banco de la ficha simétrica: el diálogo REAL de «Configurar
 * campos de la ficha» y la ficha REAL abierta (`ContactInfoPanel`). Las
 * acciones de servidor van mudas; las de la configuración de campos, fingidas
 * (`acciones-de-la-ficha.ts`) para poder darle a la ficha una lista.
 */
(window as any).guardado = null;
const raiz = () => ((window as any).__raiz ??= createRoot(document.getElementById("app")!));

(window as any).pintarDialogo = (campos: unknown[]) => {
    raiz().render(
        <ContactFieldsConfigDialog
            key={Math.random()}
            userId="u1"
            open
            onOpenChange={() => {}}
            fields={campos as any}
            onSaved={(f) => { (window as any).guardado = f; }}
        />,
    );
};

(window as any).pintarFicha = (campos: unknown[]) => {
    (window as any).__campos = campos;
    const sesion: any = { id: 1, userId: "u1", remoteJid: "573001112233@s.whatsapp.net", agentDisabled: false };
    raiz().render(
        <div className="flex h-screen">
            <div className="flex-1" />
            <ContactInfoPanel
                {...({
                    session: sesion, displayedContactName: "Yair Silvera", displayedWhatsapp: "+57 300 111 2233",
                    userId: "u1", remoteJid: sesion.remoteJid, notesCount: 0, advisors: [],
                    onClose: () => {}, onSessionMutate: () => {}, onSessionRefresh: async () => {},
                    abierto: true,
                } as any)}
            />
        </div>,
    );
};
(window as any).listo = true;
