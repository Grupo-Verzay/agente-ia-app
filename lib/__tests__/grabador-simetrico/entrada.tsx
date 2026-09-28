import React from "react";
import { createRoot } from "react-dom/client";
import { GrabadorDeAudio } from "@/components/shared/GrabadorDeAudio";

/**
 * El `GrabadorDeAudio` REAL dentro de una caja del ancho que se pida
 * (`?w=274`: el contenido de la tarjeta de 300 px de un paso de flujo; más
 * ancho: el formulario de Macros), y dentro de `.app-module-content`, que es
 * donde vive en la App y lo que decide el tamaño de letra de sus botones.
 */
declare global {
    interface Window {
        listo?: boolean;
    }
}
const ancho = Number(new URLSearchParams(location.search).get("w") || 274);

createRoot(document.getElementById("app")!).render(
    <div className="app-module-content" style={{ padding: 16 }}>
        <div data-caja style={{ width: ancho }}>
            <GrabadorDeAudio onGrabado={() => {}} />
        </div>
    </div>,
);
window.listo = true;
