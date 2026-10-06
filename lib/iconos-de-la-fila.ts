/**
 * Qué iconitos ve cada PERSONA en la lista de conversaciones de Chats.
 *
 * Son cinco interruptores, todos ENCENDIDOS por defecto: no haber tocado nada
 * es ver la fila como siempre. Apagar uno es una decisión de quien mira y no
 * cambia ningún dato: la calificación, el asesor, lo no leído y las notas
 * siguen ahí; solo dejan de pintarse en la fila.
 *
 * Puro: lo usan la tarjeta de Apariencia, la acción que guarda y la lista.
 */

export const ICONOS_DE_LA_FILA = [
  {
    clave: "calificacion",
    titulo: "Estado del cliente",
    detalle: "Frío, tibio o caliente.",
  },
  {
    clave: "asesor",
    titulo: "Asesor asignado",
    detalle: "Asignado a ti o a otro asesor.",
  },
  {
    clave: "sinLeer",
    titulo: "Mensajes sin leer",
    detalle: "El punto azul de las conversaciones que no has abierto.",
  },
  {
    clave: "notaInterna",
    titulo: "Nota interna",
    detalle: "El candado de las conversaciones con notas.",
  },
  {
    clave: "resumenIa",
    titulo: "Resumen de IA",
    detalle: "El resumen que deja la IA al cerrar una conversación.",
  },
] as const;

export type ClaveDeIcono = (typeof ICONOS_DE_LA_FILA)[number]["clave"];
export type IconosDeLaFila = Record<ClaveDeIcono, boolean>;

export const CLAVES_DE_ICONOS: readonly ClaveDeIcono[] = ICONOS_DE_LA_FILA.map((i) => i.clave);

export const ICONOS_POR_DEFECTO: IconosDeLaFila = {
  calificacion: true,
  asesor: true,
  sinLeer: true,
  notaInterna: true,
  resumenIa: true,
};

/**
 * Lo que llega de la base o del navegador. Solo un `false` explícito apaga:
 * lo que falte o no se entienda queda ENCENDIDO, que es ver de más y nunca
 * esconder un aviso por un dato raro.
 */
export function comoIconosDeLaFila(valor: unknown): IconosDeLaFila {
  const fuente =
    valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};
  const salida = { ...ICONOS_POR_DEFECTO };
  for (const clave of CLAVES_DE_ICONOS) {
    if (fuente[clave] === false) salida[clave] = false;
  }
  return salida;
}

/** Con una clave cambiada; una clave que no existe no cambia nada. */
export function conElIcono(
  actuales: IconosDeLaFila,
  clave: string,
  visible: boolean,
): IconosDeLaFila {
  if (!(CLAVES_DE_ICONOS as readonly string[]).includes(clave)) return actuales;
  return { ...actuales, [clave]: visible === true };
}

/**
 * Si una nota interna es el resumen que escribe la IA al cerrar o transferir
 * (`conversation-intelligence-actions.ts` la titula «RESUMEN IA · …»).
 */
export const PREFIJO_DEL_RESUMEN_IA = "RESUMEN IA";

export function esResumenIa(texto: string | null | undefined): boolean {
  return (texto ?? "").trimStart().toUpperCase().startsWith(PREFIJO_DEL_RESUMEN_IA);
}

/**
 * La nota que puede salir en la vista previa de la fila, según los iconos.
 *
 * - Con «Nota interna» apagada no sale ninguna: la vista previa de una nota
 *   lleva el mismo candado que se apagó.
 * - Con «Resumen de IA» apagado no sale el resumen; una nota escrita por una
 *   persona sí.
 *
 * Sin nota que enseñar, la vista previa vuelve a ser el último mensaje.
 */
export function laNotaQueSeEnsena<T extends { texto: string }>(
  nota: T | null,
  iconos: IconosDeLaFila,
): T | null {
  if (!nota) return null;
  if (!iconos.notaInterna) return null;
  if (!iconos.resumenIa && esResumenIa(nota.texto)) return null;
  return nota;
}
