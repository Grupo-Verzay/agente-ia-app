"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { puedoAbrirTicketsAction } from "@/actions/tickets-actions";
import { FormularioDeTicket } from "./FormularioDeTicket";

/**
 * El botón flotante de soporte, en todas las pantallas.
 *
 * Cuelga de `Breadcrumbs` —la barra que es la misma en toda la App— y no de
 * cada pantalla: así está donde esté la persona, que es lo que pedía el
 * encargo. **No pinta nada hasta que hay algo que pintar**, igual que el aviso
 * de tarea.
 *
 * ## Un botón, dos comportamientos, y los decide quién eres
 *
 * - Para una cuenta cliente: abre el formulario.
 * - Para la cuenta de destino: lleva al tablero. Esa cuenta no abre tickets
 *   consigo misma; los atiende.
 *
 * Quién es cada uno lo dice el servidor (`puedoAbrirTicketsAction`), no la
 * pantalla: enseñar el botón no es abrir la puerta — quien decide de verdad es
 * la acción de guardar, que vuelve a comprobarlo.
 *
 * ## Y sin destino configurado no sale
 *
 * Un botón que guarda en la nada es peor que no tener botón: el cliente se
 * queda esperando una respuesta que nadie va a ver.
 */
export function BotonDeSoporte() {
    const router = useRouter();
    const pathname = usePathname() ?? "/";
    const [estado, setEstado] = useState<{
        puede: boolean;
        soyElDestino: boolean;
        userId: string | null;
        whatsapp: string | null;
    } | null>(null);
    const [abierto, setAbierto] = useState(false);

    useEffect(() => {
        let vivo = true;
        void (async () => {
            try {
                const res = await puedoAbrirTicketsAction();
                if (vivo) setEstado(res);
            } catch (error) {
                // Sin esto, un fallo aquí deja el botón sin pintar y sin motivo.
                console.warn("[tickets] no se pudo saber si mostrar el botón", error);
            }
        })();
        return () => {
            vivo = false;
        };
    }, []);

    if (!estado || (!estado.puede && !estado.soyElDestino)) return null;

    // En sus propias pantallas el botón sobra: ahí ya hay uno que hace lo mismo
    // y encima tapa la lista.
    if (pathname.startsWith("/mis-tickets") || pathname.startsWith("/tickets")) return null;

    const alPulsar = () => {
        if (estado.soyElDestino) router.push("/tickets");
        else setAbierto(true);
    };

    return (
        <>
            <button
                type="button"
                onClick={alPulsar}
                title={estado.soyElDestino ? "Tickets de soporte" : "Pedir soporte"}
                aria-label={estado.soyElDestino ? "Tickets de soporte" : "Pedir soporte"}
                className={cn(
                    "fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full",
                    "bg-primary text-primary-foreground shadow-lg shadow-primary/30",
                    "transition-transform hover:scale-105 focus-visible:outline-none",
                    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                )}
            >
                <LifeBuoy className="h-5 w-5" />
            </button>

            {estado.puede && estado.userId && (
                <FormularioDeTicket
                    abierto={abierto}
                    onAbierto={setAbierto}
                    userId={estado.userId}
                    whatsappPorDefecto={estado.whatsapp}
                    onCreado={() => router.push("/mis-tickets")}
                />
            )}
        </>
    );
}
