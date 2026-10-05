import { elegirPreferenciaDelChat } from "@/lib/chat-preference-key";

/**
 * Bloquear y silenciar una conversación de Chats. Puro: lo usan la bandeja, el
 * aviso de mensajes nuevos y el banco.
 *
 * | | ¿sale en la lista? | ¿avisa? | ¿cómo se quita? |
 * | --- | --- | --- | --- |
 * | **bloqueada** | NO, aunque el cliente escriba | no | a mano, desde «Bloqueados» |
 * | **silenciada** | sí, como siempre | NO | a mano |
 *
 * La marca vive en `chat_bloqueo_silencio` (tabla de la App), con la MISMA
 * llave que las demás marcas de Chats —cuenta dueña, línea y número— y bajo
 * TODAS las identidades del contacto, así que se lee con la misma regla
 * (`elegirPreferenciaDelChat`): manda la fila de su línea, y entre varias la
 * que se tocó la última.
 *
 * **Bloquear no se levanta solo.** El borrado sí (un mensaje del contacto lo
 * revive); un bloqueo existe justamente para que eso no pase.
 */
export type MarcaDeBloqueo = {
  instanceName: string;
  remoteJid: string;
  bloqueadoEn: string | null;
  silenciadoEn: string | null;
  updatedAt: string | null;
};

export type MapaDeBloqueos = Record<string, MarcaDeBloqueo>;

export type EstadoDeBloqueo = { bloqueado: boolean; silenciado: boolean };

export const SIN_BLOQUEO: EstadoDeBloqueo = Object.freeze({ bloqueado: false, silenciado: false });

export function elEstadoDelChat(
  mapa: MapaDeBloqueos | undefined,
  cuentaDuena: string,
  linea: string | null | undefined,
  identidades: string[],
  repartidasEntreLineas?: ReadonlySet<string>,
): EstadoDeBloqueo {
  if (!mapa || !cuentaDuena) return SIN_BLOQUEO;
  const marca = elegirPreferenciaDelChat(mapa, cuentaDuena, linea, identidades, repartidasEntreLineas);
  if (!marca) return SIN_BLOQUEO;
  return { bloqueado: Boolean(marca.bloqueadoEn), silenciado: Boolean(marca.silenciadoEn) };
}

/** Lo que se escribe al pulsar. Solo la columna que se pide: bloquear no toca el silencio. */
export function elCambio(
  que: "bloqueo" | "silencio",
  activar: boolean,
  ahora: Date = new Date(),
): { bloqueadoEn?: Date | null; silenciadoEn?: Date | null } {
  const valor = activar ? ahora : null;
  return que === "bloqueo" ? { bloqueadoEn: valor } : { silenciadoEn: valor };
}

/** Con la marca puesta en memoria, para pintarlo al momento (antes de que conteste el servidor). */
export function conLaMarca(
  mapa: MapaDeBloqueos,
  llaves: string[],
  que: "bloqueo" | "silencio",
  activar: boolean,
  base: { instanceName: string; remoteJid: string },
  ahora: Date = new Date(),
): MapaDeBloqueos {
  const siguiente = { ...mapa };
  const valor = activar ? ahora.toISOString() : null;
  for (const llave of llaves) {
    const previa = siguiente[llave] ?? {
      instanceName: base.instanceName,
      remoteJid: base.remoteJid,
      bloqueadoEn: null,
      silenciadoEn: null,
      updatedAt: null,
    };
    siguiente[llave] = {
      ...previa,
      ...(que === "bloqueo" ? { bloqueadoEn: valor } : { silenciadoEn: valor }),
      updatedAt: ahora.toISOString(),
    };
  }
  return siguiente;
}
