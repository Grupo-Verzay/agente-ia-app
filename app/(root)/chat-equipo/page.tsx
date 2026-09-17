import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { hiloDelEquipoAction } from "@/actions/chat-de-equipo-actions";
import { ChatDeEquipoClient } from "./_components/ChatDeEquipoClient";

export const dynamic = "force-dynamic";

/**
 * El chat interno del equipo: **un hilo por cuenta**.
 *
 * La pantalla **no pinta ninguna barra de pestañas**, y es a propósito: esa la
 * pone el módulo desde el layout (`PanelAwareTabNav` con los `moduleItems`).
 * Pintándola aquí saldrían dos, una debajo de la otra, y la de la pantalla no
 * sabría nada de los permisos de cada persona.
 *
 * Y la puerta no está aquí: está en la acción, que resuelve la cuenta desde
 * `currentUser()`. La pantalla pinta lo que la consulta le devuelva — así no
 * puede abrir más de lo que la consulta deja. Quien entra a una cuenta ajena
 * con «Ingresar» ve el hilo de ESA cuenta (#756).
 */
export default async function ChatDeEquipoPage() {
    const user = await currentUser();
    if (!user) redirect("/login");

    const res = await hiloDelEquipoAction();
    if (!res.success) {
        return (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
                {res.message}
            </div>
        );
    }

    return (
        <ChatDeEquipoClient
            inicial={res.data.mensajes}
            yo={res.data.yo}
            equipo={res.data.equipo}
        />
    );
}
