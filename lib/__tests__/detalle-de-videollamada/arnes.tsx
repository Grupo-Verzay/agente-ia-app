import React from "react";
import { createRoot } from "react-dom/client";
import { CallDetailDialog } from "@/app/(root)/crm/llamadas/_components/CallDetailDialog";
import { laFilaDeTavus, ponerLaFila } from "./acciones";

(window as any).abrir = (videoUrl: string | null) => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("pantalla")!));
    const fila = laFilaDeTavus(videoUrl);
    ponerLaFila(fila);
    raiz.render(null);
    setTimeout(() => {
        raiz.render(
            React.createElement(CallDetailDialog as any, {
                key: String(videoUrl),
                call: fila,
                // Lo que le pasa la lista: `call.recordingUrl` (aquí, el audio).
                recordingUrl: (fila as any).recordingUrl ?? null,
                open: true,
                onOpenChange: () => {},
            }),
        );
    }, 0);
};
(window as any).listo = true;
