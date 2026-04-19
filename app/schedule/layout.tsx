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
        <main className={`flex flex-1 w-full h-full flex-col justify-center items-center ${themeClass} p-6`}>
            {children}
        </main>
    );
}