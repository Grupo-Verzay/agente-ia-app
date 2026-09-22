import "server-only";

import type { Instancia } from "@prisma/client";
import { db } from "@/lib/db";

export type LineasDeUnaCuenta = {
  /** La cuenta dueña de estas líneas. */
  linkedUserId: string;
  company: string;
  instances: Instancia[];
};

/**
 * Las líneas de WhatsApp de unas cuentas, agrupadas por cuenta.
 *
 * Sustituye a `getLinkedAccountsInstances` y `getMasterAccountInstances`, que
 * vivían en un fichero `'use server'` —o sea, eran dos endpoints que devolvían
 * las líneas de la cuenta que se les nombrara, sin preguntar nada— y que además
 * juntaban las cuentas en los DOS sentidos: la segunda traía las líneas de la
 * cuenta MADRE. Aquí no se decide a quién: la lista de cuentas la pone quien
 * llama, con `lasCuentasQueVeLaBandeja`.
 *
 * Nunca lanza: sin líneas vinculadas la bandeja se queda con las propias, que
 * es el lado seguro. Pero lo dice.
 */
export async function lasLineasDeLasCuentas(ids: string[]): Promise<LineasDeUnaCuenta[]> {
  const cuentas = Array.from(new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean)));
  if (cuentas.length === 0) return [];

  try {
    const [filas, instances] = await Promise.all([
      db.user.findMany({ where: { id: { in: cuentas } }, select: { id: true, company: true } }),
      db.instancia.findMany({
        where: {
          userId: { in: cuentas },
          OR: [
            // "waha" es WhatsApp Mensajería, tan línea de WhatsApp como las
            // otras. Sin ella, en cuanto una línea de una cuenta vinculada
            // pasaba a ese proveedor DESAPARECÍA de la bandeja.
            { instanceType: { in: ["Whatsapp", "waha"] } },
            { instanceType: "meta", metaChannel: "whatsapp" },
          ],
        },
      }),
    ]);
    const empresa = new Map(filas.map((f) => [f.id, f.company ?? ""]));
    return cuentas
      .filter((id) => empresa.has(id))
      .map((id) => ({
        linkedUserId: id,
        company: empresa.get(id) ?? "",
        instances: instances.filter((inst) => inst.userId === id),
      }));
  } catch (error) {
    console.warn("[chats] no se pudieron leer las lineas de las cuentas vinculadas", {
      cuentas: cuentas.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
