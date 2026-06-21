import { themeClass } from "@/types/generic";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Reservar cita | Multi-agenda",
    description: "Elige servicio, especialista y horario disponible para tu cita.",
};

export default function PublicBookingsLayout({ children }: { children: ReactNode }) {
    return (
        <main className={`h-screen overflow-y-auto w-full flex flex-col items-center ${themeClass} px-0 py-0 sm:px-6 sm:py-6`}>
            {children}
        </main>
    );
}
