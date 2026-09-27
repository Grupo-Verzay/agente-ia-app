import React from "react";
import { createRoot } from "react-dom/client";
import { MessageBubble } from "@/app/(root)/chats/_components/MessageBubble";

/**
 * La burbuja REAL, las dos caras (propia y del contacto), con un «Reenviar»
 * conectado. Es la MISMA maqueta en los dos modos: en el roto se empaqueta con
 * la `MessageBubble` de antes, que no sabe qué es `onForward`, y el banco
 * afirma que no ofrece ninguna forma de reenviar.
 */
declare global {
    interface Window { log: string[]; listo?: boolean }
}
window.log = [];
const apuntar = (s: string) => () => { window.log.push(s); };

function Burbuja({ id, propia, texto }: { id: string; propia: boolean; texto: string }) {
    return (
        <div data-burbuja={id} style={{ padding: 40 }}>
            <MessageBubble
                message={texto}
                isUserMessage={propia}
                timestamp={1_700_000_000_000}
                messageId={id}
                onReply={apuntar(`responder:${id}`)}
                onCopy={apuntar(`copiar:${id}`)}
                onReact={() => window.log.push(`reaccionar:${id}`)}
                {...({ onForward: apuntar(`reenviar:${id}`) } as Record<string, unknown>)}
            />
        </div>
    );
}

createRoot(document.getElementById("app")!).render(
    <div className="app-module-content" style={{ width: 700 }}>
        <Burbuja id="propia" propia texto="Hola, te paso la cotización" />
        <Burbuja id="ajena" propia={false} texto="¿Me la reenvías a mi socio?" />
    </div>,
);
window.listo = true;
