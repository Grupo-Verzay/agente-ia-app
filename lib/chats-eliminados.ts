/**
 * La LÁPIDA de un chat o de un lead eliminado: qué hacer con un mensaje que
 * llega de un contacto que alguien eliminó.
 *
 * Eliminar no era definitivo porque lo borrado se REESCRIBE solo: el sondeo
 * del chat abierto, la precarga, la importación de historial de Waha, el eco
 * de un seguimiento que salió después y la reposición de fichas cada cinco
 * minutos vuelven a escribir las filas que el borrado acababa de quitar, sin
 * que nadie haya tocado ese chat. Desde fuera, el chat o el lead «vuelve».
 *
 * Así que borrar ya no es solo quitar filas: deja una lápida por línea e
 * identidad del contacto (`chats_eliminados`), y TODO lo que escribe un
 * mensaje, una conversación o una ficha pregunta aquí antes de escribir.
 *
 * Es puro y está COPIADO byte a byte en el backend
 * (`api-webhook/src/modules/webhook/utils/chats-eliminados.ts`): la App y el
 * motor escriben las mismas tablas y tienen que decidir lo mismo. Si se toca
 * uno, se copia al otro; los dos bancos los comparan.
 */

/**
 * Qué se eliminó:
 * - `chat`: la conversación entera (historial y ficha).
 * - `ficha`: solo el lead; la conversación sigue.
 */
export type AlcanceDeLaLapida = "chat" | "ficha";

export type Lapida = {
  /** La eliminación más reciente (del chat o solo de la ficha). */
  eliminadoEn: Date;
  /**
   * Hasta dónde se borró el HISTORIAL. Solo lo pone eliminar el chat; lo de
   * antes no vuelve nunca, ni aunque el contacto escriba después.
   */
  historialHasta: Date | null;
  /** El contacto escribió después: lo eliminado puede volver a nacer. */
  revividoEn: Date | null;
  alcance: AlcanceDeLaLapida;
};

export type MensajeQueLlega = {
  /** La hora del propio mensaje de WhatsApp; `null` si no la trae. */
  hora: Date | null;
  /** Viene de resincronizar historial ya conocido, no de algo en vivo. */
  esHistorial: boolean;
  fromMe: boolean;
  /** Lo escribió una persona desde el panel (no la IA, un flujo o un aviso). */
  porUnaPersona: boolean;
};

export type AccionDeLaLapida = "nada" | "revivir" | "devolver-la-conversacion";

export type QueHacerConElMensaje = {
  /** Escribir el mensaje en `chat_messages`. */
  mensaje: boolean;
  /** Escribir o subir la fila de `chat_conversations` (la bandeja). */
  conversacion: boolean;
  /** Se puede CREAR la ficha (`Session`). Actualizar una que existe, siempre. */
  ficha: boolean;
  accion: AccionDeLaLapida;
};

const TODO: QueHacerConElMensaje = {
  mensaje: true,
  conversacion: true,
  ficha: true,
  accion: "nada",
};

const NADA: QueHacerConElMensaje = {
  mensaje: false,
  conversacion: false,
  ficha: false,
  accion: "nada",
};

/**
 * Un mensaje es VIEJO respecto a una marca si su hora no pasa de ella. Sin
 * hora, un mensaje en vivo es de ahora mismo; uno que viene de resincronizar
 * historial no se sabe, y se trata como viejo: es el lado seguro, porque
 * reescribir lo eliminado es justo el fallo.
 */
export function esDeAntesDe(marca: Date | null, mensaje: MensajeQueLlega): boolean {
  if (!marca) return false;
  if (mensaje.hora && Number.isFinite(mensaje.hora.getTime())) {
    return mensaje.hora.getTime() <= marca.getTime();
  }
  return mensaje.esHistorial;
}

export function estaRevivida(lapida: Lapida): boolean {
  return Boolean(lapida.revividoEn) && lapida.revividoEn!.getTime() >= lapida.eliminadoEn.getTime();
}

export function queHacerConElMensaje(
  lapida: Lapida | null,
  mensaje: MensajeQueLlega,
): QueHacerConElMensaje {
  if (!lapida) return TODO;

  const revivida = estaRevivida(lapida);

  // Lo que se eliminó con el chat no vuelve, aunque el contacto haya escrito
  // después: el historial de antes se borró a propósito.
  if (esDeAntesDe(lapida.historialHasta, mensaje)) return NADA;

  // Solo se eliminó la ficha: la conversación sigue y su historial también,
  // pero un mensaje viejo no puede crear el lead otra vez.
  if (lapida.alcance === "ficha" && esDeAntesDe(lapida.eliminadoEn, mensaje)) {
    return { mensaje: true, conversacion: true, ficha: revivida, accion: "nada" };
  }

  if (revivida) return TODO;

  // El contacto escribió después de eliminar: es una conversación nueva, y
  // vuelve todo. Es la regla de siempre: «vuelve si el cliente escribe».
  if (!mensaje.fromMe) return { ...TODO, accion: "revivir" };

  if (lapida.alcance === "chat") {
    // Una persona le escribe desde el panel a alguien que se eliminó: la
    // conversación tiene que verse, porque la acaba de abrir ella. El lead no
    // vuelve hasta que el contacto conteste.
    if (mensaje.porUnaPersona) {
      return {
        mensaje: true,
        conversacion: true,
        ficha: false,
        accion: "devolver-la-conversacion",
      };
    }
    // Un envío automático (un seguimiento, la IA, una campaña) queda escrito
    // pero no devuelve un chat que alguien eliminó.
    return { mensaje: true, conversacion: false, ficha: false, accion: "nada" };
  }

  // Solo se eliminó la ficha: lo que sale se ve en la conversación, que sigue,
  // pero un mensaje propio no crea el lead otra vez.
  return { mensaje: true, conversacion: true, ficha: false, accion: "nada" };
}

/**
 * Entre varias lápidas del mismo contacto —una por identidad, quizá de dos
 * eliminaciones— manda la de la eliminación MÁS RECIENTE. Una vieja ya
 * revivida no puede tapar una eliminación nueva.
 */
export function laLapidaQueManda<T extends Lapida>(lapidas: readonly T[]): T | null {
  let mejor: T | null = null;
  for (const lapida of lapidas) {
    if (!mejor || lapida.eliminadoEn.getTime() > mejor.eliminadoEn.getTime()) {
      mejor = lapida;
    } else if (
      lapida.eliminadoEn.getTime() === mejor.eliminadoEn.getTime() &&
      lapida.alcance === "chat" &&
      mejor.alcance !== "chat"
    ) {
      // A igual hora, eliminar el chat dice más que eliminar la ficha.
      mejor = lapida;
    }
  }
  return mejor;
}
