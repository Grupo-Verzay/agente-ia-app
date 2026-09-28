import React from "react";
import { createRoot } from "react-dom/client";
import { MediaViewer } from "@/app/(root)/chats/_components/media-viewer/MediaViewer";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

/**
 * Un diálogo abierto por página (`?caso=`), con los componentes REALES:
 *
 * - `visor-pdf` y `visor-doc`: el visor de adjuntos de Chats (`p-0`), el caso
 *   que se reportó.
 * - `normal`: el diálogo de siempre, `p-6`.
 * - `sin-relleno`: `p-0 gap-0` con cabecera propia (Nuevo mensaje, el
 *   simulador, Macros…).
 * - `px-0`: sin relleno a los lados (los de Flujos).
 * - `largo`: contenido que desplaza, para ver que la X no se mueve.
 */
function Caso({ caso }: { caso: string }) {
    const nada = () => {};
    if (caso === "visor-pdf" || caso === "visor-doc") {
        return (
            <MediaViewer
                open
                onClose={nada}
                media={{
                    type: "document",
                    url: "/no-existe.pdf",
                    mimeType: caso === "visor-pdf" ? "application/pdf" : "application/msword",
                    fileName: "Contrato de servicio firmado.pdf",
                } as any}
            />
        );
    }
    if (caso === "sin-relleno") {
        return (
            <Dialog open>
                <DialogContent className="flex flex-col overflow-hidden p-0 gap-0 sm:max-w-md">
                    <DialogHeader data-cabecera="" className="px-5 pt-5 pb-3 border-b">
                        <DialogTitle className="text-base font-semibold">Nuevo mensaje</DialogTitle>
                    </DialogHeader>
                    <div data-cuerpo="" className="p-5 text-sm">Cuerpo</div>
                </DialogContent>
            </Dialog>
        );
    }
    if (caso === "px-0") {
        return (
            <Dialog open>
                <DialogContent className="px-0">
                    <DialogHeader data-cabecera="" className="px-6">
                        <DialogTitle>Ventana de seguimiento</DialogTitle>
                    </DialogHeader>
                    <div className="px-6 text-sm">Cuerpo</div>
                </DialogContent>
            </Dialog>
        );
    }
    const largo = caso === "largo";
    return (
        <Dialog open>
            <DialogContent>
                <DialogHeader data-cabecera="">
                    <DialogTitle>Editar cliente</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                    {Array.from({ length: largo ? 60 : 2 }, (_, i) => (
                        <p key={i}>Renglón {i + 1}</p>
                    ))}
                </div>
                <DialogFooter>
                    <button type="button">Cancelar</button>
                    <button type="button">Guardar</button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const caso = new URLSearchParams(location.search).get("caso") ?? "normal";
createRoot(document.getElementById("app")!).render(<Caso caso={caso} />);
(window as any).listo = true;
