import "server-only";

import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";
import { SOLO_LO_QUE_YA_ADMINISTRAS } from "@/lib/vincular-cuentas";

/**
 * La puerta de VINCULAR una cuenta existente bajo la de quien llama: solo si
 * esa cuenta ya se alcanza, con la puerta de siempre. Así vincular no abre
 * nada que no estuviera abierto — que es justo lo que hacía: una fila
 * `master = yo, linked = ella` es, desde #898, llegar a ella.
 *
 * La usan las DOS acciones que escriben esa fila (`linkExistingAdvisor` en
 * Usuarios y `addLinkedAccount` en el conmutador). Con la condición en cada
 * una, a la segunda se le olvida — que es como estaban las dos.
 *
 * No lanza: devuelve el motivo, que las dos acciones enseñan tal cual. Y el
 * rechazo no es mudo, porque lo típico no es un ataque sino alguien que
 * intenta vincular la cuenta de otra empresa.
 */
export async function puertaParaVincular(
    objetivoId: string,
): Promise<{ puede: true } | { puede: false; motivo: string }> {
    try {
        await assertCanAccessTargetUser(objetivoId);
        return { puede: true };
    } catch (error) {
        console.warn("[vincular] se pidió vincular una cuenta que no se alcanza", {
            objetivoId,
            motivo: error instanceof Error ? error.message : String(error),
        });
        return { puede: false, motivo: SOLO_LO_QUE_YA_ADMINISTRAS };
    }
}
