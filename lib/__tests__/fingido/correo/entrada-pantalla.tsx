import React from "react";
import { createRoot } from "react-dom/client";
import { CorreoClient } from "@/app/(root)/correo/_components/CorreoClient";

(window as any).maqueta = () => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("app")!));
    raiz.render(
        // El hueco de un módulo: alto fijo, y el contenido se reparte dentro.
        <div style={{ height: "calc(100vh - 16px)", padding: 8 }}>
            <CorreoClient conectado={null} error={null} />
        </div>,
    );
};
(window as any).listo = true;
