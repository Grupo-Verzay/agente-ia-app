import { idDeWhatsapp } from '@/lib/id-de-whatsapp';

/**
 * Qué falta de un chat y dónde escribirlo, sin tocar la red ni la base.
 *
 * El relleno pide a Evolution o a Waha el historial de un chat y guarda lo que
 * nuestra base no tiene: sobre todo lo que el dueño escribió desde su teléfono
 * antes de que el webhook lo guardara (api-webhook#174 y #175).
 *
 * Dos reglas, y las dos existen para no duplicar:
 *
 * 1. **Un mensaje ya está si su id de WhatsApp ya está en la línea, bajo
 *    CUALQUIERA de las identidades del contacto.** Se compara por el id
 *    crudo (`idDeWhatsapp`) y por `fromMe`, no por la cadena guardada: Waha lo
 *    serializa y Evolution lo entrega pelado, y una línea que cambió de
 *    proveedor tiene las dos formas. Mirar solo la identidad que da el
 *    proveedor es exactamente cómo sale duplicado un contacto guardado por su
 *    `@lid` y devuelto por su número.
 * 2. **Lo que falta se escribe DONDE YA VIVE la conversación**, no donde lo
 *    diga el proveedor. Si el chat está guardado bajo el `@lid` y el proveedor
 *    lo devuelve por el número, escribir bajo el número partiría la
 *    conversación en dos: la mitad nueva en una ficha y la vieja en otra.
 */

export type MensajeTraido = {
  /** El id tal cual lo da el proveedor. */
  messageId: string;
  fromMe: boolean;
  /** Las identidades del contacto que trae este mensaje (remoteJid, alt, senderPn). */
  jids: string[];
};

export type FilaExistente = {
  messageId: string;
  fromMe: boolean;
  remoteJid: string;
};

export type PlanDelChat<T extends MensajeTraido = MensajeTraido> = {
  /** Lo que se va a escribir, y bajo qué identidad. */
  aEscribir: T[];
  escribirBajo: string;
  yaEstaban: number;
  /** De los que ya estaban, cuántos bajo una identidad distinta de `escribirBajo`. */
  yaEstabanBajoOtraIdentidad: number;
  /** Repetidos dentro de lo que devolvió el proveedor (se escribe uno). */
  repetidosEnLoTraido: number;
  /** Las identidades bajo las que la conversación tiene filas, con cuántas. */
  identidadesConFilas: Record<string, number>;
  /** Hay filas bajo más de una identidad: la conversación YA estaba partida. */
  yaPartida: boolean;
};

export function llaveDelMensaje(messageId: string, fromMe: boolean): string {
  return `${fromMe ? 1 : 0}:${idDeWhatsapp(messageId)}`;
}

/** Un `@lid` no es un teléfono: una conversación bajo el número manda sobre él. */
function esTelefono(jid: string): boolean {
  return /@(s\.whatsapp\.net|c\.us)$/i.test(jid);
}

export function planDelChat<T extends MensajeTraido>(params: {
  /** El chat tal como lo nombra el proveedor. */
  jidDelProveedor: string;
  traidos: T[];
  existentes: FilaExistente[];
}): PlanDelChat<T> {
  const identidadesConFilas: Record<string, number> = {};
  const yaGuardadas = new Map<string, string>();
  for (const fila of params.existentes) {
    identidadesConFilas[fila.remoteJid] = (identidadesConFilas[fila.remoteJid] ?? 0) + 1;
    const llave = llaveDelMensaje(fila.messageId, fila.fromMe);
    if (!yaGuardadas.has(llave)) yaGuardadas.set(llave, fila.remoteJid);
  }

  const escribirBajo = dondeViveLaConversacion(params.jidDelProveedor, identidadesConFilas);

  const aEscribir: T[] = [];
  const vistos = new Set<string>();
  let yaEstaban = 0;
  let yaEstabanBajoOtraIdentidad = 0;
  let repetidosEnLoTraido = 0;

  for (const m of params.traidos) {
    if (!m.messageId?.trim()) continue;
    const llave = llaveDelMensaje(m.messageId, m.fromMe);
    if (vistos.has(llave)) {
      repetidosEnLoTraido++;
      continue;
    }
    vistos.add(llave);
    const donde = yaGuardadas.get(llave);
    if (donde !== undefined) {
      yaEstaban++;
      if (donde !== escribirBajo) yaEstabanBajoOtraIdentidad++;
      continue;
    }
    aEscribir.push(m);
  }

  return {
    aEscribir,
    escribirBajo,
    yaEstaban,
    yaEstabanBajoOtraIdentidad,
    repetidosEnLoTraido,
    identidadesConFilas,
    yaPartida: Object.keys(identidadesConFilas).length > 1,
  };
}

/**
 * La identidad bajo la que se escribe: la que ya tiene más filas; a igualdad,
 * la del teléfono; sin filas, la del proveedor.
 */
export function dondeViveLaConversacion(
  jidDelProveedor: string,
  identidadesConFilas: Record<string, number>,
): string {
  const candidatas = Object.entries(identidadesConFilas);
  if (candidatas.length === 0) return jidDelProveedor;
  candidatas.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const telA = esTelefono(a[0]) ? 1 : 0;
    const telB = esTelefono(b[0]) ? 1 : 0;
    if (telB !== telA) return telB - telA;
    return a[0].localeCompare(b[0]);
  });
  return candidatas[0][0];
}

/** Estados, difusiones y canales no son conversaciones. */
export function esChatQueSeRellena(jid: string): boolean {
  const j = (jid ?? '').trim();
  if (!j.includes('@')) return false;
  return !/(^status@|@broadcast$|@newsletter$)/i.test(j);
}

/**
 * Por dónde se retoma un recorrido cortado: el primer chat DESPUÉS del último
 * hecho, en orden alfabético. Por jid y no por posición: si entra un chat nuevo
 * mientras tanto, una posición apuntaría a otro.
 */
export function chatsQueQuedan(chats: string[], ultimoHecho: string | null): string[] {
  const ordenados = Array.from(new Set(chats.filter(esChatQueSeRellena))).sort();
  if (!ultimoHecho) return ordenados;
  return ordenados.filter((c) => c > ultimoHecho);
}
