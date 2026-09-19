import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { HiloDelEquipo } from "@/components/chat-equipo/HiloDelEquipo";

export const dynamic = "force-dynamic";

/**
 * El chat interno del equipo: **canales y directos, por cuenta**.
 *
 * Es la MISMA pantalla que el panel lateral —los dos pintan `HiloDelEquipo`—,
 * y se queda para quien la quiera montar como módulo en su menú. Por donde se
 * usa de verdad es el panel: el equipo vive en Chats y no va a salir de ahí
 * para hablar.
 *
 * La pantalla **no pinta ninguna barra de pestañas**, y es a propósito: esa la
 * pone el módulo desde el layout (`PanelAwareTabNav` con los `moduleItems`).
 * Pintándola aquí saldrían dos, una debajo de la otra, y la de la pantalla no
 * sabría nada de los permisos de cada persona.
 *
 * Y la puerta no está aquí: está en la acción, que resuelve la cuenta desde
 * `currentUser()` y devuelve **solo los canales que esa persona puede leer**.
 * La pantalla pinta lo que la consulta le devuelva — así no puede abrir más de
 * lo que la consulta deja. Quien entra a una cuenta ajena con «Ingresar» ve
 * los canales de ESA cuenta (#756).
 *
 * `?canal=` y `?mensaje=` son por dónde llega un aviso de mención: el primero
 * abre la conversación donde se dijo y no el general, y el segundo pone delante
 * el mensaje — en un canal con tráfico, aterrizar al final del hilo no es
 * encontrar la mención. Si ese canal no es suyo, la acción devuelve el general:
 * lo que llega del navegador no decide a qué se llega.
 */
export default async function ChatDeEquipoPage({
    searchParams,
}: {
    searchParams?: { canal?: string; mensaje?: string };
}) {
    const user = await currentUser();
    if (!user) redirect("/login");

    // Quién entra, para volver al canal donde se estaba. Se resuelve aquí y
    // no en la pantalla: hace falta antes de la primera consulta, y `window`
    // no sabe de cuentas.
    return (
        <HiloDelEquipo
            canalInicial={searchParams?.canal}
            mensajeInicial={searchParams?.mensaje}
            cuentaId={user.ownerId ?? user.id}
            personaId={laPersonaQueActua(user).id}
        />
    );
}
