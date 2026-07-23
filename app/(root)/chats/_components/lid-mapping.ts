import { isLidJid } from '@/lib/whatsapp-jid';

/** Mapa de @lid (normalizado `<digitos>@lid`) -> JID de teléfono real. */
export type LidPhoneMap = Record<string, string>;

/** Normaliza cualquier @lid a `<digitos>@lid` (quita sufijo de dispositivo :NN). */
function normLidKey(value: string): string {
  const digits = (value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  return digits ? `${digits}@lid` : '';
}

/**
 * Aplica el mapeo aprendido a una lista de chats (incluye los que llegan EN VIVO
 * de Evolution/Baileys, que no traen el alias). Para cada chat cuyo remoteJid es
 * un @lid con número conocido, lo CANONICALIZA al número real y conserva el @lid
 * como alias. Así el chat @lid se fusiona con el contacto real y deja de aparecer
 * duplicado — de forma estable, aunque siga llegando actividad por el @lid.
 *
 * Puro y defensivo: si no hay mapa, devuelve la lista tal cual.
 */
export function applyLidMappingToChats<
  T extends { remoteJid?: string; remoteJidAlt?: string | null },
>(chats: T[], lidMap: LidPhoneMap | undefined | null): T[] {
  // Reactivada. El deduplicado ya separa POR LÍNEA (instanceName), así que
  // canonicalizar un @lid a su número real fusiona el duplicado DENTRO de su
  // propia línea sin colapsar las otras líneas del mismo cliente. Si aún se
  // observara que un chat multi-línea se oculta, el siguiente paso es hacer las
  // marcas de eliminar/archivar también POR LÍNEA.
  if (!lidMap || !chats?.length) return chats;
  const keys = Object.keys(lidMap);
  if (keys.length === 0) return chats;
  return chats.map((chat) => {
    const rj = chat.remoteJid ?? '';
    if (!isLidJid(rj)) return chat;
    const phone = lidMap[normLidKey(rj)];
    if (!phone || phone === rj) return chat;
    return { ...chat, remoteJid: phone, remoteJidAlt: chat.remoteJidAlt || rj };
  });
}
