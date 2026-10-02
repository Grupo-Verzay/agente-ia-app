/**
 * Las REACCIONES de una conversacion, vistas desde la App.
 *
 * El reporte: «el cliente reacciona con un emoji desde su WhatsApp, el evento
 * llega, y en la conversacion no se ve; al reves si funciona». Eran tres
 * huecos, y este modulo tapa los dos de la App (el tercero, que nadie la
 * guardaba al llegar, se cerro en el backend: `chatStore.guardarReaccion`):
 *
 * 1. **El sondeo de Evolution SI trae las reacciones** (`reactionMessage`), y
 *    `persistEvolutionMessages` las tiraba sin mirarlas. Ahora se cuelgan de su
 *    mensaje (`raw.reaccion`) con `guardarReaccion`, la MISMA funcion que usa la
 *    plataforma para las suyas: ni fila nueva ni columna nueva.
 *    `lasReaccionesQueTrae` decide cual vale por mensaje: la ULTIMA por hora,
 *    porque cambiar de emoji o quitarlo son reacciones nuevas al mismo mensaje.
 * 2. **El chat abierto no repintaba una reaccion.** `areListsDifferent` solo
 *    mira el largo y el ultimo mensaje, y una reaccion no cambia ninguno de los
 *    dos: cambia un campo de un mensaje de en medio. La lista nueva llegaba con
 *    el emoji y se tiraba por «igual». `cambioAlgunaReaccion` es la pregunta
 *    que faltaba.
 *
 * Puro: lo usan `lib/chat-persistence.ts` y `chats-client.tsx`, y lo prueba su
 * banco sin base.
 */

type ConReaccion = {
  key?: { id?: string | null } | null;
  messageType?: string | null;
  messageTimestamp?: unknown;
  message?: { reactionMessage?: { key?: { id?: string | null } | null; text?: string | null } | null } | null;
  reaccion?: unknown;
};

/** ¿Es este mensaje una reaccion (y no un mensaje)? */
export function esUnaReaccion(m: ConReaccion | null | undefined): boolean {
  return m?.messageType === 'reactionMessage' || Boolean(m?.message?.reactionMessage);
}

function enMs(ts: unknown): number {
  const n = typeof ts === 'number' ? ts : Number((ts as { low?: number } | null)?.low ?? ts);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1e12 ? n * 1000 : n;
}

/**
 * De lo que trae el proveedor, la reaccion que vale para cada mensaje: la
 * ULTIMA por hora (a igual hora, la que viene despues en la lista). Un emoji
 * vacio es «quitada» y tambien vale: es lo que dijo el ultimo.
 */
export function lasReaccionesQueTrae(lista: ConReaccion[]): Array<{ idDelMensaje: string; emoji: string }> {
  const por = new Map<string, { emoji: string; ms: number; orden: number }>();
  lista.forEach((m, orden) => {
    if (!esUnaReaccion(m)) return;
    const rm = m.message?.reactionMessage;
    const id = typeof rm?.key?.id === 'string' ? rm.key.id.trim() : '';
    if (!id) return;
    const emoji = typeof rm?.text === 'string' ? rm.text.trim() : '';
    const ms = enMs(m.messageTimestamp);
    const antes = por.get(id);
    if (!antes || ms > antes.ms || (ms === antes.ms && orden > antes.orden)) por.set(id, { emoji, ms, orden });
  });
  return Array.from(por, ([idDelMensaje, v]) => ({ idDelMensaje, emoji: v.emoji }));
}

/** El emoji colgado de un mensaje (`reaccion` de nuestra base), o ''. */
function laDe(m: ConReaccion): string {
  return typeof m.reaccion === 'string' ? m.reaccion : '';
}

/**
 * ¿Cambio la reaccion de algun mensaje entre lo que se ve (`a`) y lo que trae
 * el reloj (`b`)? Se comparan por id; un mensaje que no esta en los dos no
 * cuenta (de eso ya se ocupa el largo).
 */
export function cambioAlgunaReaccion(
  a: ConReaccion[],
  b: ConReaccion[],
  idDe: (m: ConReaccion) => string | undefined = (m) => m.key?.id ?? undefined,
): boolean {
  const antes = new Map<string, string>();
  for (const m of a) {
    const id = idDe(m);
    if (id) antes.set(id, laDe(m));
  }
  for (const m of b) {
    const id = idDe(m);
    if (!id || !antes.has(id)) continue;
    if (antes.get(id) !== laDe(m)) return true;
  }
  return false;
}
