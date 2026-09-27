/**
 * Qué seguimientos de un número se pueden borrar desde UNA cuenta.
 *
 * Un seguimiento (`seguimientos`) **no tiene `userId`**: cuelga de su LÍNEA
 * (`instancia`, que según quién lo escribió guarda el `instanceName` o el
 * `instanceId`). Y el mismo número de teléfono está en muchas cuentas —le
 * escribe a Ventas y a Atención, o a dos clientes distintos de la plataforma—.
 *
 * Así que borrar «los seguimientos de este número» con un `where` que solo
 * lleva el `remoteJid` se lleva los de TODAS las cuentas de la plataforma. Es
 * lo que pasaba al marcar un lead como Descartado y al escribir la frase de
 * despedida: la acción ocurría en una cuenta y la limpieza cruzaba a las demás.
 *
 * La regla: **se borran los de ese número en las líneas de la cuenta donde
 * ocurrió la acción, y ninguno más.** Sin líneas no hay nada que borrar: el
 * `where` sale en `null` y quien llama no consulta — un `IN ()` vacío que se
 * convirtiera en «sin filtro» sería volver al fallo.
 *
 * Es pura para poder probarse sin base. La MISMA regla está escrita en el
 * backend (`api-webhook/src/modules/seguimientos/seguimientos-de-la-cuenta.ts`)
 * para la herramienta «Marcar_Descartado» del agente: las dos tienen que decir
 * lo mismo.
 */

export type LineaDeLaCuenta = {
    instanceName: string | null | undefined;
    instanceId: string | null | undefined;
};

/** Los dos nombres con los que una línea puede estar escrita en `seguimientos.instancia`. */
export function lasLlavesDeLasLineas(lineas: LineaDeLaCuenta[]): string[] {
    const llaves = new Set<string>();
    for (const l of lineas) {
        for (const v of [l.instanceName, l.instanceId]) {
            const limpio = typeof v === "string" ? v.trim() : "";
            if (limpio) llaves.add(limpio);
        }
    }
    return [...llaves];
}

export type DondeBorrar = { remoteJid: string; instancia: { in: string[] } };

/**
 * El `where` del borrado, o `null` si no hay nada que borrar (sin número o sin
 * líneas). Nunca devuelve un `where` sin `instancia`.
 */
export function dondeBorrarLosSeguimientos(
    remoteJid: string | null | undefined,
    lineas: LineaDeLaCuenta[],
): DondeBorrar | null {
    const jid = typeof remoteJid === "string" ? remoteJid.trim() : "";
    if (!jid) return null;
    const llaves = lasLlavesDeLasLineas(lineas);
    if (!llaves.length) return null;
    return { remoteJid: jid, instancia: { in: llaves } };
}
