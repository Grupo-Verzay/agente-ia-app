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
>(chats: T[], _lidMap: LidPhoneMap | undefined | null): T[] {
  // TEMPORALMENTE DESACTIVADO. La canonicalización de @lid al número real hacía
  // que un chat @lid compartiera el número con las otras líneas del mismo
  // cliente, y así heredaba las marcas de ocultar/eliminar/archivar de esas
  // líneas → los chats multi-línea DESAPARECÍAN. Se deja como no-op para
  // restaurar la estabilidad. El arreglo correcto (marcas y dedup POR LÍNEA)
  // se hará por separado; entonces se reactiva esta fusión de forma segura.
  return chats;
}
