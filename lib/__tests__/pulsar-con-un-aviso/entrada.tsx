/**
 * La maqueta del banco `pulsar-con-un-aviso-encima`: el aviso de la App (el
 * `Toaster` de `@/components/ui/sonner`, abajo a la derecha como en
 * `app/layout.tsx`) y un botón Guardar que el banco coloca DONDE sale el aviso,
 * que es donde queda el de la última tarjeta de una pantalla pegada al borde
 * de abajo (la URL personalizada del editor de Mis formularios).
 *
 * Lo que se apunta es lo único que dice si el clic llegó: `window.pulsados`.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

declare global {
    interface Window {
        pulsados: string[];
        avisar: (texto: string) => void;
        avisarParaSiempre: (texto: string) => void;
        colocar: (x: number, y: number) => void;
        listo: boolean;
    }
}

window.pulsados = [];
window.avisar = (texto) => {
    toast.success(texto);
};
window.avisarParaSiempre = (texto) => {
    toast.success(texto, { duration: Infinity });
};
window.colocar = (x, y) => {
    const b = document.querySelector<HTMLElement>("[data-boton-guardar]");
    if (!b) return;
    b.style.left = `${x - b.offsetWidth / 2}px`;
    b.style.top = `${y - b.offsetHeight / 2}px`;
};

function Pantalla() {
    return (
        <main style={{ minHeight: "100vh", fontFamily: "sans-serif" }}>
            <button
                type="button"
                data-boton-guardar
                onClick={() => window.pulsados.push("guardar")}
                style={{ position: "fixed", left: 20, top: 20, width: 96, height: 32, background: "#2563eb", color: "#fff", border: 0, borderRadius: 6 }}
            >
                Guardar
            </button>
            <Toaster position="bottom-right" richColors />
        </main>
    );
}

createRoot(document.getElementById("app")!).render(<Pantalla />);
window.listo = true;
