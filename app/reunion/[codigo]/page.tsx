import type { Metadata } from "next";

import { LaReunion } from "./_components/LaReunion";

/**
 * La página de una reunión, abierta por su enlace.
 *
 * **Pública a propósito** —está en `publicRoutes` del middleware— porque el
 * enlace se le pasa a alguien de fuera que no tiene cuenta. Y ser pública no la
 * abre: tener el enlace deja **llamar a la puerta**, no entrar. Quien pasa lo
 * decide alguien que ya está dentro, y eso lo comprueba el servidor en cada
 * vuelta.
 *
 * Vive fuera de `(root)` a propósito: una reunión ocupa la pantalla entera y no
 * quiere ni barra lateral ni pestañas de módulo. Y quien la abre puede no tener
 * cuenta, así que ese layout ni siquiera tendría qué pintar.
 */

export const metadata: Metadata = {
    title: "Reunión",
    // Un enlace de reunión no se indexa: es privado por definición, y lo único
    // que podría aportar un buscador es filtrar salas de gente.
    robots: { index: false, follow: false },
};

export default async function PaginaDeLaReunion({
    params,
}: {
    params: Promise<{ codigo: string }>;
}) {
    const { codigo } = await params;
    return (
        <main className="h-[100dvh] w-full overflow-hidden bg-zinc-950">
            <LaReunion codigo={codigo} />
        </main>
    );
}
