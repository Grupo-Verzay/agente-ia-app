import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { FranjaDeSentimiento } from "@/components/chats/FranjaDeSentimiento";
import type { SentimientoDeLaConversacion } from "@/lib/sentimiento";

/** La franja REAL, con un mando para cambiarle el sentimiento desde el banco. */
function Maqueta() {
    const [s, setS] = useState<SentimientoDeLaConversacion | null>(null);
    (window as any).ponerSentimiento = setS;
    return (
        <div style={{ width: 600 }} className="flex flex-col">
            <div style={{ height: 200 }}>mensajes</div>
            <FranjaDeSentimiento sentimiento={s} llaveDeLaConversacion="LINEA::573001@s.whatsapp.net" />
            <div data-barra-de-escribir style={{ height: 50 }} className="border-t">barra</div>
        </div>
    );
}

createRoot(document.getElementById("app")!).render(<Maqueta />);
(window as any).listo = true;
