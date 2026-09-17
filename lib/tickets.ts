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

/**
 * El color de cada columna del tablero.
 *
 * Es un hexadecimal y no una clase de Tailwind porque la cabecera de la columna
 * lo usa con opacidades calculadas (`${color}0A`, `${color}52`), igual que el
 * tablero de Proyectos. Son los mismos cinco colores que `COLORES_DE_ESTADO`,
 * en su versión sólida: dos escalas distintas para lo mismo se ven disparejas
 * cuando el sello y su columna quedan uno al lado del otro.
 */
export const COLOR_DE_COLUMNA: Record<EstadoDeTicket, string> = {
  recibido: "#0EA5E9",
  en_proceso: "#F59E0B",
  en_revision: "#8B5CF6",
  resuelto: "#10B981",
  descartado: "#94A3B8",
};

/**
 * ¿Es un estado del que ya no se espera nada?
 *
 * Los dos finales se leen distinto en la tarjeta: de uno abierto interesa
 * **cuánto lleva esperando**, y de uno cerrado, cuánto hace que se cerró.
 * Decir «esperando hace 3 días» de un ticket resuelto es mentir con un dato
 * cierto.
 */
export function esEstadoFinal(estado: EstadoDeTicket): boolean {
  return estado === "resuelto" || estado === "descartado";
}

/**
 * Cuánto hace, en palabras.
 *
 * Puro y con la hora de ahora por parámetro: leyendo `Date.now()` por dentro no
 * hay forma de probarlo, y esto es justo lo que se mira de un vistazo para
 * saber qué ticket lleva más tiempo sin atender.
 */
export function cuantoHace(desdeIso: string, ahoraMs: number): string {
  const desde = new Date(desdeIso).getTime();
  // Una fecha que no se entiende no se sustituye por «hace 0 min»: eso pondría
  // el ticket más viejo arriba del todo como si acabara de entrar.
  if (!Number.isFinite(desde)) return "";
  const segundos = Math.max(0, Math.floor((ahoraMs - desde) / 1000));
  if (segundos < 3600) return `hace ${Math.max(1, Math.floor(segundos / 60))} min`;
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;
  const dias = Math.floor(segundos / 86400);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  return new Date(desde).toLocaleDateString();
}

/**
 * Lo que dice la tarjeta debajo del título: cuánto lleva esperando.
 *
 * De un ticket abierto se mide desde que ENTRÓ, no desde el último cambio de
 * estado: lo que hay que ver es cuánto lleva el cliente esperando, y moverlo de
 * «recibido» a «en proceso» no le quita ni un minuto de espera. De uno cerrado
 * se mide desde `actualizadoEn`, que es cuando se cerró.
 */
export function laEspera(
  ticket: Pick<Ticket, "estado" | "creadoEn" | "actualizadoEn">,
  ahoraMs: number,
): string {
  if (esEstadoFinal(ticket.estado)) {
    const cuando = cuantoHace(ticket.actualizadoEn, ahoraMs);
    return cuando ? `${ticket.estado === "resuelto" ? "Resuelto" : "Descartado"} ${cuando}` : "";
  }
  const cuando = cuantoHace(ticket.creadoEn, ahoraMs);
  return cuando ? `Esperando ${cuando}` : "";
}

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
