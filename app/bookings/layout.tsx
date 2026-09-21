import { themeClass } from "@/types/generic";
import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Reservar cita | Multi-agenda",
    description: "Elige servicio, especialista y horario disponible para tu cita.",
};

/**
 * Su propio contenedor que se desplaza: el `<body>` va con `overflow-hidden` y
 * eso se propaga al viewport, así que una pantalla de fuera de `(root)` que no
 * lo declare nace sin poder desplazarse. Ver `lib/pantalla-publica.ts`.
 */
export default function PublicBookingsLayout({ children }: { children: ReactNode }) {
    return (
        <main className={`w-full ${themeClass} ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
            {children}
        </main>
    );
}
