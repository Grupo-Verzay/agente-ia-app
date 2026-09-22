import 'server-only';

import { currentUser } from '@/lib/auth';
import { resolveInstanceOwner } from '@/lib/chat-persistence';
import { getAssociatedAccountIds } from '@/lib/cuentas-asociadas';
import { juzgarLaLineaDelCanal, type VeredictoDeLaLinea } from '@/lib/linea-del-canal';

/**
 * La puerta de toda acción que ENVÍA (o lee plantillas) por una línea de canal.
 *
 * Va ANTES de cualquier cosa con efecto: antes de pausar la IA de esa
 * conversación y, sobre todo, antes de hablar con el backend. Un rechazo no
 * deja nada escrito ni llega al proveedor.
 *
 * El alcance es `getAssociatedAccountIds`, el de la bandeja: la cuenta propia y
 * las que cuelgan de ella hacia abajo. Nunca hacia arriba ni hacia los lados.
 *
 * Un rechazo **no es mudo**: el caso típico no es un ataque sino una pantalla
 * que manda la línea equivocada, y sin el aviso no habría forma de saber cuál.
 */
export async function laLineaDelCanalAlcanza(
    instanceName: string,
    que: string,
): Promise<VeredictoDeLaLinea> {
    const user = await currentUser();
    const cuentasQueAlcanza = user?.id ? await getAssociatedAccountIds(user) : null;
    const dueno = cuentasQueAlcanza ? await resolveInstanceOwner(instanceName) : null;

    const veredicto = juzgarLaLineaDelCanal({
        instanceName,
        cuentasQueAlcanza,
        duenoId: dueno?.userId ?? null,
    });

    if (!veredicto.ok) {
        console.warn('[canales] envío rechazado: la línea no es de quien envía', {
            que,
            instanceName,
            motivo: veredicto.motivo,
            quien: user?.sessionUserId ?? user?.id ?? null,
            dueno: dueno?.userId ?? null,
        });
    }
    return veredicto;
}
