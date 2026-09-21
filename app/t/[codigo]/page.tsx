import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";

import { laFichaPublicaAction } from "@/actions/tickets-publico-actions";
import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";
import { FichaPublicaDeTicket } from "./_components/FichaPublicaDeTicket";

/**
 * La ficha de soporte de una cuenta, abierta por su enlace permanente.
 *
 * **Pública a propósito** —está en `publicRoutes` del middleware— porque el
 * enlace se lo pasa cada cuenta a SUS clientes por WhatsApp, y esa gente no
 * tiene cuenta en la plataforma ni va a tenerla.
 *
 * Y ser pública no la abre: el código solo dice **a qué bandeja cae** lo que se
 * envíe. De este lado no se lee nada de la cuenta salvo cómo se llama y su
 * logo, que es justo lo que hace falta para que quien escribe sepa a quién le
 * está escribiendo.
 *
 * Vive fuera de `(root)` a propósito, como `/reunion`: quien la abre no tiene
 * sesión, así que ese layout —barra lateral, módulos, campanita— no tendría ni
 * qué pintar.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Soporte",
    // No se indexa: es el canal de soporte de una cuenta concreta, y lo único
    // que podría aportar un buscador es filtrar enlaces de clientes.
    robots: { index: false, follow: false },
};

export default async function PaginaDeFichaPublica({
    params,
}: {
    params: Promise<{ codigo: string }>;
}) {
    const { codigo } = await params;
    const ficha = await laFichaPublicaAction(codigo);

    if (!ficha.success || !ficha.data) {
        return (
            <main
                className={`flex items-center justify-center bg-muted/30 px-4 ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}
            >
                <div className="w-full max-w-sm space-y-3 rounded-xl border bg-card p-6 text-center shadow-sm">
                    <LifeBuoy className="mx-auto h-10 w-10 text-muted-foreground" />
                    <p className="text-base font-semibold">Este enlace ya no está disponible</p>
                    {/* No se dice si existió, ni de quién era: quien tiene el
                        enlace puede ser cualquiera, y «existe pero está
                        cerrado» ya cuenta algo de una cuenta. */}
                    <p className="text-sm text-muted-foreground">
                        Pídele a quien te lo compartió un enlace nuevo.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className={`bg-muted/30 ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
            <FichaPublicaDeTicket codigo={codigo} ficha={ficha.data} />
        </main>
    );
}
