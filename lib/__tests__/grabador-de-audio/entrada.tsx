import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { GrabadorDeAudio } from "@/components/shared/GrabadorDeAudio";
import { validateFileType as validarEnWorkflow } from "@/app/(root)/workflow/[workflowId]/helpers/validateFileType";
import { validateFileType as validarEnFlow } from "@/app/(root)/flow/[workflowId]/helpers/validateFileType";

/**
 * El `GrabadorDeAudio` REAL, montado solo. Lo que entrega por `onGrabado` se
 * apunta en `window.grabados`, con lo que dirían de ese archivo las dos
 * validaciones de los editores de flujos: es la puerta por la que entra en un
 * paso de nota de voz.
 */
declare global {
    interface Window {
        grabados: Array<{ nombre: string; tipo: string; bytes: number; pasaWorkflow: boolean; pasaFlow: boolean }>;
        listo: boolean;
    }
}
window.grabados = [];

function Arnes() {
    const [n, setN] = useState(0);
    return (
        <div style={{ padding: 16, width: 360 }}>
            <GrabadorDeAudio
                onGrabado={(f) => {
                    window.grabados.push({
                        nombre: f.name,
                        tipo: f.type,
                        bytes: f.size,
                        pasaWorkflow: validarEnWorkflow(f, "audio"),
                        pasaFlow: validarEnFlow(f, "audio"),
                    });
                    setN((x) => x + 1);
                }}
            />
            <p data-entregados>{n}</p>
        </div>
    );
}

createRoot(document.getElementById("app")!).render(<Arnes />);
window.listo = true;
