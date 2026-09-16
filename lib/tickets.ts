/**
 * Las reglas de un ticket de soporte. **Puro**: aquí no entra nada del
 * servidor, para que de esto puedan tirar las tres pantallas —el formulario del
 * cliente, «Mis tickets» y la lista del administrador— sin arrastrar Prisma al
 * navegador. Es el mismo reparto que `adjuntos-de-tarea-tipos`.
 *
 * # Tickets NO es Proyectos
 *
 * Proyectos es el trabajo interno del equipo; un ticket es de un CLIENTE y
 * cuelga de su cuenta. Comparten formas —adjuntos, estados, un tablero— pero no
 * datos: un ticket no puede aparecer en Proyectos ni al revés, y por eso vive en
 * su propia tabla y no colgado de `tasks`, que además es del backend.
 */

/**
 * Los cinco estados, en el orden en que avanza un ticket.
 *
 * El orden importa: es el de las columnas del tablero y el de las pestañas de
 * la lista, y escribirlo dos veces es garantizar que un día no coincidan.
 */
export const ESTADOS_DE_TICKET = [
  "recibido",
  "en_proceso",
  "en_revision",
  "resuelto",
  "descartado",
] as const;

export type EstadoDeTicket = (typeof ESTADOS_DE_TICKET)[number];

/** Cómo se llama cada estado. **Los cinco los ve el cliente**, tal cual. */
export const ETIQUETAS_DE_ESTADO: Record<EstadoDeTicket, string> = {
  recibido: "Recibido",
  en_proceso: "En proceso",
  en_revision: "En revisión",
  resuelto: "Resuelto",
  descartado: "Descartado",
};

/** Con qué se pinta cada estado. Dos son finales y se leen distinto. */
export const COLORES_DE_ESTADO: Record<EstadoDeTicket, string> = {
  recibido: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  en_proceso: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  en_revision: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  resuelto: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  descartado: "bg-muted text-muted-foreground",
};

/** Lo que llega de fuera no se da por bueno: lo que no está en la lista, no es. */
export function comoEstadoDeTicket(valor: unknown): EstadoDeTicket | null {
  const texto = String(valor ?? "").trim();
  return (ESTADOS_DE_TICKET as readonly string[]).includes(texto)
    ? (texto as EstadoDeTicket)
    : null;
}

/**
 * Descartar exige decir por qué, y el cliente lo lee.
 *
 * Un ticket que desaparece sin motivo se lee como que nadie lo miró, que es
 * peor que decirle que no: la persona vuelve a abrirlo y el trabajo se
 * duplica.
 */
export function exigeMotivo(estado: EstadoDeTicket): boolean {
  return estado === "descartado";
}

/**
 * ¿Hay que avisar por WhatsApp con este cambio?
 *
 * **Solo al PASAR a resuelto.** Dos cosas, y las dos importan:
 *
 * 1. Solo `resuelto`. Los demás cambios no se avisan: un ticket que va y viene
 *    entre «en proceso» y «en revisión» le mandaría cuatro WhatsApps a alguien
 *    que no ha pedido seguimiento, y eso se aprende a ignorar — con lo que el
 *    aviso que sí importa se ignora también.
 * 2. **Pasar**, no estar. Guardar dos veces el mismo estado, o volver a
 *    resuelto después de reabrirlo, no puede mandar otro aviso por cada
 *    pulsación. Por eso se compara con el estado ANTERIOR y no solo con el
 *    nuevo.
 */
export function avisaAlCliente(antes: EstadoDeTicket, despues: EstadoDeTicket): boolean {
  return despues === "resuelto" && antes !== "resuelto";
}

/**
 * El texto del aviso.
 *
 * Puro y aquí, no interpolado en la acción: es lo único que le llega al cliente
 * por fuera de la App, y tenerlo suelto dentro de un `await` es como acaban
 * saliendo los avisos con un centinela dentro.
 */
export function avisoDeResuelto(titulo: string): string {
  const limpio = titulo.trim();
  return (
    `✅ *Tu solicitud de soporte fue resuelta*\n\n` +
    (limpio ? `_${limpio.slice(0, 200)}_\n\n` : "") +
    `Puedes ver el detalle en «Mis tickets» dentro de la App.`
  );
}

/** Un ticket tal y como lo pintan las pantallas. */
export type Ticket = {
  id: string;
  /** La cuenta del cliente que lo abrió. */
  clienteId: string;
  /** La cuenta de administrador que lo recibe. */
  destinoId: string;
  titulo: string;
  descripcion: string;
  /** El número al que se avisa cuando se resuelve. */
  whatsapp: string;
  estado: EstadoDeTicket;
  /** Por qué se descartó. Solo con `estado === "descartado"`. */
  motivoDescarte: string | null;
  creadoEn: string;
  actualizadoEn: string;
  /** Cuándo salió el aviso de resuelto. Nulo = todavía no. */
  avisadoEn: string | null;
  /** Para la lista del administrador: de quién es. */
  clienteNombre?: string | null;
};

/** Tope de lo que se escribe, para que un pegado enorme no entre a la base. */
export const TOPE_DEL_TITULO = 160;
export const TOPE_DE_LA_DESCRIPCION = 4000;
export const TOPE_DEL_MOTIVO = 500;

/**
 * ¿Se puede guardar esto?
 *
 * Se comprueba aquí —puro— para que digan lo mismo el formulario y la acción.
 * La acción **vuelve a llamarlo**: un formulario es una comodidad, no una
 * puerta.
 */
export function queLeFaltaAlTicket(input: {
  titulo?: string | null;
  descripcion?: string | null;
  whatsapp?: string | null;
}): string | null {
  if (!(input.titulo ?? "").trim()) return "Ponle un título.";
  if (!(input.descripcion ?? "").trim()) return "Cuéntanos qué pasa.";
  const numero = soloDigitos(input.whatsapp);
  // Diez es lo que mide un número nacional sin indicativo; por debajo de eso no
  // hay a quién avisar y el ticket nacería con un aviso imposible.
  if (numero.length < 10) return "Falta el WhatsApp al que avisarte.";
  return null;
}

/**
 * El número, tal y como se guarda: solo dígitos.
 *
 * La gente lo escribe con espacios, guiones, paréntesis y un `+` delante. Si se
 * guarda tal cual, el envío falla al llegar y el fallo se ve al final del todo
 * —cuando ya se resolvió el ticket— que es cuando peor se arregla.
 */
export function soloDigitos(valor: string | null | undefined): string {
  return String(valor ?? "").replace(/\D+/g, "");
}
