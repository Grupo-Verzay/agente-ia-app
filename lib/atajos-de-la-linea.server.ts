import "server-only";

import { db } from "@/lib/db";
import { resolveInstanceOwner } from "@/lib/chat-persistence";
import { cuentasDeLasFilas, elAtajoEsDeLaLinea } from "@/lib/atajos-de-la-linea";

/** La cuenta dueña de cada creador de atajos, en UNA consulta. */
export async function lasCuentasDeLosCreadores(ids: readonly string[]): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  if (!unicos.length) return new Map();
  const filas = await db.user.findMany({
    where: { id: { in: unicos } },
    select: { id: true, ownerId: true },
  });
  return cuentasDeLasFilas(unicos, filas);
}

/**
 * ¿Es de la cuenta de esta línea el atajo que creó `creadorId`?
 *
 * Se resuelven las DOS puntas en el servidor: el dueño de la línea sale de
 * `Instancias` y la cuenta del atajo de su creador. Nada de lo que diga el
 * navegador decide por dónde sale un workflow.
 */
export async function esAtajoDeLaLinea(
  creadorId: string | null | undefined,
  instanceName: string | null | undefined,
): Promise<{ ok: boolean; cuentaDelAtajo: string | null; cuentaDeLaLinea: string | null }> {
  const linea = String(instanceName ?? "").trim();
  const [dueno, cuentas] = await Promise.all([
    linea ? resolveInstanceOwner(linea) : Promise.resolve(null),
    lasCuentasDeLosCreadores(creadorId ? [creadorId] : []),
  ]);
  const cuentaDeLaLinea = dueno?.userId ?? null;
  const cuentaDelAtajo = creadorId ? cuentas.get(creadorId) ?? null : null;
  const ok = elAtajoEsDeLaLinea(cuentaDelAtajo, cuentaDeLaLinea);
  if (!ok) {
    // No es mudo: el caso típico no es un ataque, es una pantalla que ofreció
    // el atajo de otra cuenta. Sin esta línea no se sabe cuál.
    console.warn("[chats] se intentó mandar un atajo de otra cuenta por esta línea", {
      linea,
      cuentaDeLaLinea,
      cuentaDelAtajo,
    });
  }
  return { ok, cuentaDelAtajo, cuentaDeLaLinea };
}
