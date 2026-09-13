import "server-only";

import { currentUser } from "@/lib/auth";
import { cuentaQueManda, type CuentaQueManda } from "@/lib/cuenta-que-manda";

/**
 * La cuenta que configura, o `null` si quien pregunta no puede configurar nada.
 *
 * Es la puerta de cualquier ajuste que sea DE LA CUENTA —el reparto de
 * asesores, el escalado, los tiempos de respuesta de la IA—: el dueño pasa, su
 * administrador pasa actuando por ella, y un `agente` no pasa. Es participar,
 * no mandar; el mismo reparto de `canManageWorkspace`.
 *
 * Devuelve el id de la CUENTA, nunca el de la persona: es de la cuenta de quien
 * cuelgan estos ajustes, y preguntar por la persona es justo lo que dejaba a
 * los administradores fuera de todo (ver `lib/cuenta-que-manda.ts`).
 *
 * Vive en su propio fichero y no junto a `cuentaQueManda` porque `lib/auth`
 * importa esa: tenerlo alli obligaria a importar `lib/auth` de vuelta y seria
 * un ciclo.
 */
export async function laCuentaQueConfigura(): Promise<CuentaQueManda | null> {
    const user = await currentUser();
    if (!user?.id) return null;
    if (user.ownerId && user.advisorRole !== "administrador") return null;
    return cuentaQueManda(user);
}
