"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { puedoAbrirTicketsAction } from "@/actions/tickets-actions";
import { FormularioDeTicket } from "./FormularioDeTicket";

/**
 * «Soporte», en la barra de arriba.
 *
 * ## Por qué ya no flota
 *
 * Estaba como botón flotante en la esquina de abajo a la derecha, y ahí
 * **tapaba el campo de escribir y el micrófono de Chats** — justo encima de lo
 * que más se usa de la App. Un botón que estorba a la tarea principal no se
 * gana esa esquina, por muy a mano que quede.
 *
 * Y había otro botón, «Ayuda», dos centímetros más arriba en la barra, que
 * abría un WhatsApp de soporte. Dos botones para lo mismo, uno de ellos
 * estorbando. Ahora es **uno solo**, en la barra, donde ya estaban el buscador
 * y la campana: nada tapa nada y no hay dos caminos para pedir ayuda.
 *
 * ## Un botón, dos comportamientos, y los decide quién eres
 *
 * - Cuenta cliente: abre el formulario de ticket nuevo.
 * - Cuenta de destino: lleva al tablero. Esa cuenta no abre tickets consigo
 *   misma; los atiende.
 *
 * Quién es cada uno lo dice el servidor (`puedoAbrirTicketsAction`), no la
 * pantalla: enseñar el botón no es abrir la puerta — quien decide de verdad es
 * la acción de guardar, que vuelve a comprobarlo.
 *
 * ## Y sin destino configurado no sale
 *
 * Un botón que guarda en la nada es peor que no tener botón: el cliente se
 * queda esperando una respuesta que nadie va a ver. La barra es un `flex` con
 * `gap`, así que al no pintarse **no queda hueco**: el buscador y la campana se
 * juntan y ya.
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

    // En sus propias pantallas sobra: «Mis tickets» ya tiene su «Nuevo ticket»,
    // y en el tablero el botón llevaría a la página en la que ya estás.
    if (pathname.startsWith("/mis-tickets") || pathname.startsWith("/tickets")) {
        return null;
    }

    const alPulsar = () => {
        if (estado.soyElDestino) router.push("/tickets");
        else setAbierto(true);
    };

    return (
        <>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={alPulsar}
                title={estado.soyElDestino ? "Tickets de soporte" : "Pedir soporte"}
                aria-label={estado.soyElDestino ? "Tickets de soporte" : "Pedir soporte"}
                // El mismo aspecto que tenía «Ayuda»: la barra se ve igual, lo
                // que cambia es lo que hace el botón.
                className="h-9 gap-1.5 border border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
            >
                <LifeBuoy className="h-5 w-5" />
                <span className="hidden sm:inline">Soporte</span>
            </Button>

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
