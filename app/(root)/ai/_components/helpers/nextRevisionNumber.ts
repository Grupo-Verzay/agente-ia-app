import { db } from "@/lib/db";

/**
 * Siguiente número de revisión de un prompt.
 *
 * Se calcula desde el MÁXIMO, no desde el conteo. Contar solo funciona si la
 * numeración no tiene huecos, y desde que se podan las revisiones viejas los
 * tiene siempre: si quedan la 4 a la 8, contar da 5 y pediría crear la 6 — que
 * ya existe. El publicado moría con "Unique constraint failed on
 * (promptId, revisionNumber)" y no se guardaba nada.
 */
export async function nextRevisionNumber(promptId: string) {
  const { _max } = await db.agentPromptRevision.aggregate({
    where: { promptId },
    _max: { revisionNumber: true },
  });
  return (_max.revisionNumber ?? 0) + 1;
}
