import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { laCarteraDe, laConfigDe } from "@/lib/cobros-db";
import { laLineaDeLaCuenta } from "@/lib/cobros-envio";
import { CobrosClient } from "./_components/CobrosClient";

export const dynamic = "force-dynamic";

/**
 * Cobros: la cartera de cobro de una cuenta con SUS clientes.
 *
 * **Esta ruta no está montada en ningún módulo**: entra en el desplegable de
 * «Editar módulo» y se asigna a mano donde corresponda. Eso tiene una
 * consecuencia que conviene tener presente: el guardián del layout solo cierra
 * rutas que están en algún módulo y denegadas, así que mientras no se asigne,
 * `/cobros` se alcanza escribiendo la URL.
 *
 * Por eso **la puerta no está aquí**: cada acción resuelve la cuenta y pasa por
 * `assertCanAccessTargetUser`, y esta página solo pinta lo que le devuelvan. La
 * cartera se lee ya con la cuenta de quien mira, así que nadie ve la de otro.
 */
export default async function CobrosPage() {
    const user = await currentUser();
    if (!user) redirect("/login");

    const ownerId = user.effectiveId ?? user.ownerId ?? user.id;

    // La línea va en la primera carga a propósito: una cuenta sin línea
    // conectada necesita saber **por qué** no le sale ningún cobro, y eso no se
    // puede descubrir pulsando botones.
    const [cartera, config, linea] = await Promise.all([
        laCarteraDe(ownerId),
        laConfigDe(ownerId),
        laLineaDeLaCuenta(ownerId).catch(() => null),
    ]);

    return (
        <CobrosClient
            cartera={cartera}
            config={config}
            linea={linea?.instanceName ?? null}
            puedeBorrar={canManageWorkspace(user)}
        />
    );
}
