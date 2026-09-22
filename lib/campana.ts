/**
 * Qué chips ofrece la campanita y qué se marca al pulsar «marcar leídas».
 *
 * Puro y sin imports: lo prueba el banco sin levantar React ni navegador, que
 * es lo único que hace falta para contestar las dos preguntas de abajo.
 */

/** Las clases de aviso que la campanita sabe pintar. */
export type ClaseDeAviso =
    | "task"
    | "appointment"
    | "connection"
    | "chat"
    | "mention"
    | "tarea"
    | "followup";

/** Lo mínimo de un aviso para decidir si se puede marcar. */
export type AvisoMarcable = { id: string; kind: ClaseDeAviso };

/**
 * Los chips, en su orden, y **sin «Tareas»**.
 *
 * Eran siete y convivían dos que se leen igual: «Tareas» —las del CRM, que
 * vencen— y «Mis tareas» —las que alguien te asignó—. Dos rótulos casi iguales
 * uno al lado del otro no son dos filtros: son una pregunta sobre cuál es cuál
 * cada vez que se abre la campanita.
 *
 * **Quitar el chip NO esconde sus avisos**: los de clase `task` siguen en la
 * lista —salen sin filtro— y siguen contando en la insignia roja del botón,
 * que suma las siete clases y no estas seis. Lo único que se va es la forma de
 * mirarlos por separado.
 *
 * Y de paso la rejilla sale exacta: con seis chips son dos filas de tres, así
 * que ya no hay última fila a medias (`col-span` del resto).
 */
export const CHIPS_DE_LA_CAMPANA: ClaseDeAviso[] = [
    "tarea",
    "mention",
    "chat",
    "appointment",
    "followup",
    "connection",
];

/**
 * Un aviso de conexión NO se puede dar por leído.
 *
 * Es la regla que ya tenía el clic de uno en uno, escrita aquí para que las dos
 * puertas digan lo mismo: describe algo que **sigue roto** —una cuenta sin
 * instancia, sin clave—, y esconderlo para siempre dejaría a esa cuenta sin
 * enviar mensajes sin que nadie lo recuerde. Vuelve a salir hasta que se
 * arregle.
 */
export function sePuedeMarcar(aviso: AvisoMarcable): boolean {
    return aviso.kind !== "connection";
}

/**
 * Lo que marca «marcar leídas»: SOLO lo del chip que esté puesto.
 *
 * Con la lista entera, pulsarlo desde «Menciones» se llevaría por delante los
 * chats y las citas que ni se estaban mirando — y un aviso que desaparece sin
 * haberlo visto no vuelve. Por eso la cuenta sale del chip y no del total.
 *
 * Sin chip puesto (`"all"`, que es como abre) se marca lo que se está viendo,
 * que es todo: es lo mismo que se ve en pantalla, y eso es lo que hace que el
 * botón sea predecible.
 */
export function lasQueSeMarcan<T extends AvisoMarcable>(
    avisos: T[],
    chip: ClaseDeAviso | "all",
): T[] {
    return avisos.filter((a) => (chip === "all" || a.kind === chip) && sePuedeMarcar(a));
}
