import { db } from "@/lib/db";
import { composePromptFromSections } from "@/app/(root)/ai/_components/helpers/composePromptFromSections";
import {
    normalizeAsDraft,
    normalizeAsStrict,
} from "@/app/(root)/ai/_components/helpers/normalizeOldPrompt";

/**
 * Rehace el texto que lee el agente cuando cambia algo de FUERA del prompt.
 *
 * Hoy solo lo mueve el interruptor de voz: la firma -"empieza cada mensaje con
 * *🤖 Sofia*"- no se puede incluir cuando las respuestas salen en audio, porque
 * el agente termina diciendo su propio nombre al principio de cada nota. El
 * interruptor vive en la cuenta y la firma en el prompt, y el texto se arma al
 * GUARDAR, no al leerse; sin este repaso, mover el interruptor no cambiaria
 * nada hasta que alguien editara el prompt por otro motivo.
 *
 * No toca `version`: no es una edicion de nadie, es el mismo contenido
 * recompuesto. Subirla haria que a quien tenga el editor abierto le saliera un
 * conflicto por un cambio que no hizo.
 */
export async function rehacerPromptsDeLaCuenta(
    userId: string,
    vozActiva: boolean,
): Promise<number> {
    const prompts = await db.agentPrompt.findMany({
        where: { userId },
        select: { id: true, sections: true, promptText: true },
    });

    let rehechos = 0;

    for (const prompt of prompts) {
        try {
            const texto = composePromptFromSections(
                normalizeAsDraft(normalizeAsStrict(prompt.sections)),
                { vozActiva },
            );

            // Sin cambios no se escribe: la mayoria de las cuentas no usan
            // firma, y ahi mover la voz no altera una sola letra del prompt.
            if (texto === prompt.promptText) continue;

            await db.agentPrompt.update({
                where: { id: prompt.id },
                data: { promptText: texto },
            });
            rehechos++;
        } catch (error) {
            // Un prompt viejo que no normaliza no puede impedir que se guarde
            // la configuracion de voz, que es lo que el usuario pidio.
            console.error(`[prompt-refresh] ${prompt.id} no se pudo rehacer:`, error);
        }
    }

    return rehechos;
}
