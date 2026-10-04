/**
 * La FICHA (sesión del CRM) de la conversación abierta es la de SU LÍNEA.
 *
 * El mismo contacto puede tener conversación en dos líneas —le escribe a Ventas
 * y a Atención, es lo normal— y una ficha por cada una. La fila de la lista ya
 * se quedaba con la de su línea (`getSessionForChat`, `linea::numero`), pero la
 * conversación abierta pedía la suya solo por el número, sin línea, y el
 * servidor devolvía la que mejor casara entre TODAS las líneas.
 *
 * Desde fuera: una nota interna escrita en la conversación de Atención se
 * guardaba en la ficha de Ventas, así que salía en las dos conversaciones y en
 * la vista previa de la fila de Ventas. Y lo mismo con todo lo que cuelga de la
 * ficha en la cabecera: el estado del lead, las etiquetas, el asesor.
 *
 * Esto es puro a propósito: lo comparten el hook de la conversación abierta y
 * el banco, y con la regla escrita en cada sitio volverían a separarse.
 */

/** La línea de la conversación, o nada si no se conoce. Un texto vacío no es una línea. */
export function laLineaDeLaConversacion(instanceName?: string | null): string | undefined {
  const linea = instanceName?.trim();
  return linea ? linea : undefined;
}

export interface BusquedaDeLaSesionAbierta {
  remoteJid: string;
  opciones: { aliases: string[]; instanceId?: string };
}

/**
 * Qué se le pregunta al servidor por la ficha de la conversación abierta.
 *
 * Con la línea conocida se pregunta SOLO por esa línea (`instanceId`), sin
 * caer de vuelta a las demás: un contacto sin ficha en esta línea no hereda la
 * de otra. Es la misma regla que `getSessionForChat` y `emparejarSesionesConChats`
 * (`Session.instanceId === chat.instanceName`). Sin línea, como siempre.
 */
export function laBusquedaDeLaSesionAbierta(
  remoteJid: string,
  aliases: Array<string | null | undefined>,
  instanceName?: string | null,
): BusquedaDeLaSesionAbierta {
  const candidatos = Array.from(new Set([remoteJid, ...aliases].filter((v): v is string => Boolean(v))));
  const linea = laLineaDeLaConversacion(instanceName);
  return {
    remoteJid,
    opciones: linea ? { aliases: candidatos, instanceId: linea } : { aliases: candidatos },
  };
}

/**
 * La llave con la que se recuerda «ya sembré la ficha de ESTA conversación».
 * Lleva la línea: dos líneas del mismo número son dos conversaciones, y con el
 * número solo, pasar de una a otra no volvía a sembrar ni a pedir nada.
 */
export function laLlaveDeLaConversacionAbierta(remoteJid?: string | null, instanceName?: string | null): string {
  return `${laLineaDeLaConversacion(instanceName) ?? ""}::${remoteJid ?? ""}`;
}

/**
 * Si la ficha que resolvió la conversación abierta se escribe ENTERA en la
 * llave global de la memoria de la bandeja (`chatSessions[numero]`).
 *
 * La global es la mejor ficha del contacto entre TODAS sus líneas, y la fila
 * no la lee: lee la de su línea (`linea::numero`, `laSesionDelChat`). Así que
 * con la línea conocida la ficha de esta línea solo entra en la global si está
 * vacía o ya es esa misma ficha: nunca pisa la de otra línea. Lo que la fila
 * enseña se pone al día igual, por id y en todas las llaves
 * (`conLaSesionAlDia`). Sin línea, como siempre.
 */
export function seEscribeEnLaGlobal(
  previous: Record<string, { id?: number | null } | undefined>,
  remoteJid: string,
  sessionId: number,
  instanceName?: string | null,
): boolean {
  if (!laLineaDeLaConversacion(instanceName)) return true;
  const enLaGlobal = previous[remoteJid];
  return !enLaGlobal || enLaGlobal.id === sessionId;
}

/**
 * Qué hace la memoria de la bandeja cuando el servidor dice que la
 * conversación no tiene ficha.
 *
 * Sin línea, se borra la llave global como siempre. Con línea, no se toca
 * nada: «no hay ficha en esta línea» no dice nada de la de las otras, y borrar
 * la global se llevaba la ficha que el contacto sí tiene en otra línea.
 */
export function sinFichaEnLaLinea<T>(
  previous: Record<string, T>,
  remoteJid: string,
  instanceName?: string | null,
): Record<string, T> {
  if (laLineaDeLaConversacion(instanceName)) return previous;
  if (!(remoteJid in previous)) return previous;
  const next = { ...previous };
  delete next[remoteJid];
  return next;
}
