/**
 * Vaciar la columna de Perdido, y los treinta días de gracia.
 *
 * Las reglas, puras. Lo que toca la base vive en `lib/embudos-db.ts` y el paso
 * a firme en `lib/papelera-de-embudos-runner.server.ts`.
 *
 * # Vaciar no borra: SELLA
 *
 * Es la decisión de la que cuelga todo lo demás. Si al vaciar se borrara de
 * verdad, la palabra «recuperable» no significaría nada: en esta plataforma el
 * borrado de una conversación (`hardDeleteLocalChat`) se lleva la ficha, el
 * historial, los seguimientos y el rastro del contacto, y de eso no se vuelve.
 *
 * Así que vaciar escribe una fila en `embudo_vaciadas` con la fecha, y **no
 * borra ni una sola fila de ninguna otra tabla**. La conversación sale del
 * tablero al momento; a los treinta días la borra en firme el barrido diario,
 * **por el camino de borrado que ya existe** y no por un segundo que habría que
 * mantener a la par.
 *
 * Lo que cuesta, y se dice en vez de disimularlo: **durante esos treinta días
 * la conversación sigue en Chats**. Vaciar una columna de un tablero de CRM no
 * hace desaparecer el historial de WhatsApp de la bandeja en el acto — y es
 * preferible así: lo que se recupera tiene que seguir estando entero.
 *
 * # Y la recuperación tiene pantalla
 *
 * `doc_espacios` ya sella un borrado suave y **no tiene forma de deshacerlo**:
 * su propio comentario dice que se recupera con un `UPDATE` a mano. Un plazo de
 * gracia sin botón no es un plazo de gracia, así que la papelera se abre desde
 * la misma columna, dice cuántos días quedan y restaura.
 */

/** Los días que una conversación vaciada se puede recuperar. */
export const DIAS_EN_LA_PAPELERA = 30;

/** Cuántas conversaciones se restauran o se vacían de una vez. */
export const TOPE_DE_LA_PAPELERA = 500;

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Cuántos días de gracia le quedan.
 *
 * Se cuenta en días naturales, aplastando las dos fechas a medianoche antes de
 * restar: restar en crudo y dividir por un día da cero entre las 23:00 y la
 * 01:00, que es el mismo fallo que ya costó una vuelta en los vencimientos. El
 * mínimo es 0 y nunca es negativo: un número negativo en «quedan N días» no
 * significa nada.
 */
export function diasQueQuedan(vaciadoEn: Date, ahora: Date = new Date()): number {
    const aMedianoche = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const pasados = Math.floor((aMedianoche(ahora) - aMedianoche(vaciadoEn)) / UN_DIA_MS);
    return Math.max(0, DIAS_EN_LA_PAPELERA - pasados);
}

/** ¿Ya se pasó de los treinta días? Entonces le toca el borrado en firme. */
export function yaLeTocaElBorradoEnFirme(vaciadoEn: Date, ahora: Date = new Date()): boolean {
    return diasQueQuedan(vaciadoEn, ahora) <= 0;
}

/**
 * ¿Se puede vaciar esta columna?
 *
 * **Solo la de Perdido, y se pregunta por su MARCA de sistema, no por su
 * nombre**: el nombre se puede cambiar, así que con una comprobación por texto
 * bastaría con renombrar una columna a «Perdido» para que se le pudiera vaciar
 * encima, y renombrar la de verdad para quedarse sin el botón.
 *
 * De ahí sale también que un embudo creado antes de las etapas de sistema no
 * tenga el botón en ninguna columna: no tiene ninguna marcada.
 */
export function sePuedeVaciarLaColumna(etapa: { sistema?: string | null } | null | undefined): boolean {
    return etapa?.sistema === "perdido";
}

/** Lo que la pantalla necesita saber de una conversación vaciada. */
export type EnLaPapelera = {
    sessionId: number;
    nombre: string;
    remoteJid: string;
    vaciadoEn: string;
    /** Los días que le quedan antes del borrado en firme. */
    diasQueQuedan: number;
};

/**
 * Cómo se lee lo que va a pasar, con el número delante.
 *
 * Un diálogo que no dice cuántas se lleva se acepta sin leer, y aquí el número
 * es justo lo que hace falta para decidir. Y dice que se puede deshacer: sin
 * eso, «vaciar» se lee como irreversible y no lo pulsa nadie.
 */
export function loQueDiceElVaciado(cuantas: number): string {
    if (cuantas === 0) return "En esta columna no hay conversaciones que vaciar.";
    const n = cuantas === 1 ? "1 conversación" : `${cuantas} conversaciones`;
    return `Se van a vaciar ${n}. Salen del tablero y se pueden recuperar durante ${DIAS_EN_LA_PAPELERA} días; después se borran en firme, con su historial.`;
}
