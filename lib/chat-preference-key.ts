/**
 * Clave de una preferencia de chat (fijado, archivado, borrado).
 *
 * La bandeja muestra las líneas de TODAS las cuentas asociadas, y un mismo
 * número puede escribirle a varias. La marca es de **una línea concreta**, no
 * del número: borrar un contacto en Verzay Notificaciones no puede hacerlo
 * desaparecer de Atención ni de Ventas.
 *
 * Por eso la clave lleva las tres cosas: cuenta dueña, línea y número. Es el
 * mismo criterio que `getSessionForChat` usa para las sesiones.
 *
 * Antes la clave era solo `cuenta::número`, porque la tabla no guardaba la
 * línea. Se notaba como que borrar en una línea borraba en todas — Verzay |
 * Atención cayó de 17 chats a 4 — y también en el otro sentido: el chat volvía
 * a aparecer sin explicación. La tabla ya guarda `instanceName`.
 */
export function chatPreferenceKey(
  ownerUserId: string,
  instanceName: string | null | undefined,
  remoteJid: string,
) {
  return `${ownerUserId}::${(instanceName ?? "").trim()}::${remoteJid}`;
}

/**
 * Las claves con las que buscar la marca de un chat, en orden.
 *
 * Primero la de SU línea. Después la antigua —línea vacía—, que es como
 * quedaron las marcas de cuando la tabla no guardaba la línea: siguen valiendo
 * para todas, para no resucitarle al usuario chats que ya había borrado.
 */
export function chatPreferenceKeys(
  ownerUserId: string,
  instanceName: string | null | undefined,
  remoteJid: string,
) {
  const deSuLinea = chatPreferenceKey(ownerUserId, instanceName, remoteJid);
  const antigua = chatPreferenceKey(ownerUserId, "", remoteJid);
  return deSuLinea === antigua ? [antigua] : [deSuLinea, antigua];
}
