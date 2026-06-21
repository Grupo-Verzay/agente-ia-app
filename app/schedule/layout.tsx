import { themeClass } from "@/types/generic";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Agendar cita | IA Agent",
    description: "Programa una cita personalizada con nuestro asesor",
};

export default function PublicScheduleLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <main className={`h-screen overflow-y-auto w-full flex flex-col items-center ${themeClass} px-0 py-0 sm:px-6 sm:py-6`}>
            {children}
        </main>
    );
}