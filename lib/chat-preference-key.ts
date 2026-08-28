/**
 * Clave de una preferencia de chat (fijado, archivado, borrado).
 *
 * La bandeja muestra las líneas de TODAS las cuentas asociadas, pero la marca se
 * guarda en la tabla por `(userId, remoteJid)`, sin la línea. Si el mapa del
 * cliente se indexa solo por número, un contacto que le escribe a dos líneas
 * comparte una única marca: al borrarlo en una desaparece de todas. Ya pasó —
 * Verzay | Atención cayó de 17 chats a 4.
 *
 * Por eso la clave lleva delante la cuenta dueña de la línea. Es el mismo
 * criterio que `getSessionForChat` usa para las sesiones con `instanceName::jid`.
 *
 * Ojo con el límite: dos líneas de UNA MISMA cuenta siguen compartiendo marca,
 * porque la tabla no guarda la línea. Arreglarlo pide una columna nueva, y las
 * migraciones las manda api-webhook (ver docs/db-migrations-ownership.md).
 */
export function chatPreferenceKey(ownerUserId: string, remoteJid: string) {
  return `${ownerUserId}::${remoteJid}`;
}
