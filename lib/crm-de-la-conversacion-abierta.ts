/**
 * Lo que la IA cambia en el CRM mientras se mira la conversación, se VE.
 *
 * La IA contesta y en el mismo momento toca el CRM: rellena la ficha, mueve la
 * etapa del embudo, califica el lead. La conversación abierta traía el mensaje
 * nuevo en segundos (su reloj de 5 s), pero todo lo demás se quedaba como
 * estaba al abrirla:
 *
 * | qué | cuándo se ponía al día |
 * | --- | --- |
 * | la ficha de contacto | solo al volver a abrir el chat (no tenía reloj) |
 * | la cabecera (etiquetas, registros) | solo al abrir el chat o al renombrarlo |
 * | la etapa y la calificación de la fila | con el reloj de sesiones: hasta 60 s |
 *
 * O sea: el mensaje de la IA decía «te agendé la cita» y la ficha seguía sin la
 * cita. Desde fuera no parece un error, parece un CRM que no se entera.
 *
 * La regla, y es barata a propósito: **cuando entra un mensaje NUEVO en la
 * conversación abierta, se vuelve a leer lo de ESA conversación** —su sesión,
 * su etapa y su ficha—. Una sola conversación, solo cuando de verdad llega
 * algo, y agrupando la ráfaga (la IA suele mandar dos o tres mensajes seguidos:
 * el texto, el PDF, el video). No es un reloj nuevo ni toca el de sesiones de
 * la lista, que sigue a 60 s por lo que cuesta (ver CLAUDE.md).
 *
 * Puro: lo usan `chats-client` y la ficha, y lo prueba su banco sin navegador.
 */

/** Cuánto se espera a que termine la ráfaga antes de volver a leer. */
export const ESPERA_PARA_PONER_AL_DIA_MS = 1200;

export type ElMasNuevo = { id?: string | null; ts: number };

/**
 * ¿Lo que acaba de llegar trae un mensaje NUEVO respecto de lo que ya se veía?
 *
 * Tres condiciones y hacen falta las tres:
 *   - ya se veía algo (`antes.id`): la primera carga de un chat no es una
 *     novedad, es abrirlo, y abrirlo ya lee todo lo suyo;
 *   - lo nuevo tiene otro id;
 *   - y no es más viejo: cargar mensajes anteriores cambia la lista sin que
 *     haya llegado nada.
 */
export function esUnMensajeNuevo(antes: ElMasNuevo, despues: ElMasNuevo): boolean {
    if (!antes.id || !despues.id) return false;
    if (antes.id === despues.id) return false;
    return despues.ts >= antes.ts;
}

/**
 * Los campos de la ficha después de volver a leerla, sin pisar lo que se está
 * escribiendo.
 *
 * Un campo que la persona tocó y todavía no guardó (distinto de lo último que
 * se leyó) se queda como lo tiene delante: si no, la vuelta de la IA le
 * borraría la mitad de lo que acaba de teclear. Todo lo demás toma el valor
 * fresco, y lo que aparece nuevo se añade.
 */
export function mezclarLaFicha(
    enPantalla: Record<string, string>,
    loUltimoLeido: Record<string, string>,
    fresca: Record<string, string>,
): Record<string, string> {
    const siguiente: Record<string, string> = { ...fresca };
    for (const [clave, valor] of Object.entries(enPantalla)) {
        const tocado = valor !== (loUltimoLeido[clave] ?? "");
        if (tocado) siguiente[clave] = valor;
    }
    return siguiente;
}

/**
 * Los campos de la sesión recién leída que se copian a la FILA de la lista.
 *
 * La lista guarda la sesión de un contacto bajo varias llaves (la global y la
 * de su línea, `linea::numero`) y la fila lee la de su línea. Releer la sesión
 * del chat abierto solo escribía la global, así que la fila seguía con la
 * calificación de antes hasta la vuelta del reloj de sesiones.
 *
 * Las ETIQUETAS no van a propósito: la lista las trae filtradas por quién puede
 * ver cada una (las personales de un asesor no las ve otro), y la sesión del
 * chat abierto las trae todas. Copiarlas enseñaría en la fila lo que la fila no
 * debe enseñar; esas siguen llegando con el reloj de sesiones.
 */
export const CAMPOS_DE_LA_SESION_PARA_LA_FILA = ["leadStatus", "customName", "pushName", "assignedAdvisorId"] as const;

type CampoDeLaFila = (typeof CAMPOS_DE_LA_SESION_PARA_LA_FILA)[number];

const NO_SE_BORRAN_CON_UN_VACIO: ReadonlySet<CampoDeLaFila> = new Set(["customName", "pushName"]);

/**
 * Pone al día, en TODAS las llaves de esa sesión, los campos que la fila
 * enseña. Se busca por id —el mismo en todas sus llaves—, como
 * `aplicarEnLaSesion`. Devuelve cuántas llaves tocó para que el llamador pueda
 * no repintar si no tocó ninguna.
 */
export function conLaSesionAlDia<T extends { id?: number | null } & Partial<Record<CampoDeLaFila, unknown>>>(
    mapa: Record<string, T>,
    sessionId: number,
    fresca: Partial<Record<CampoDeLaFila, unknown>>,
): { siguiente: Record<string, T>; tocadas: number } {
    let tocadas = 0;
    const siguiente: Record<string, T> = { ...mapa };
    for (const [clave, sesion] of Object.entries(mapa)) {
        if (!sesion || sesion.id !== sessionId) continue;
        const cambio: Partial<T> = {};
        let distinto = false;
        for (const campo of CAMPOS_DE_LA_SESION_PARA_LA_FILA) {
            if (!(campo in fresca)) continue;
            const valor = fresca[campo] ?? null;
            // Un nombre vacío en la lectura no borra el que la fila ya tiene:
            // el renombrado se pinta en memoria antes de que llegue a la base.
            // La calificación y el asesor sí: ahí `null` significa «sin».
            if (valor === null && NO_SE_BORRAN_CON_UN_VACIO.has(campo)) continue;
            if ((sesion[campo] ?? null) !== valor) {
                (cambio as Record<string, unknown>)[campo] = valor;
                distinto = true;
            }
        }
        if (!distinto) continue;
        siguiente[clave] = { ...sesion, ...cambio };
        tocadas++;
    }
    return { siguiente: tocadas ? siguiente : mapa, tocadas };
}

/**
 * Cada cuánto, como mucho, se piden las sesiones de la lista por una
 * conversación abierta que todavía NO tiene ficha en ella.
 */
export const ESPERA_PARA_PEDIR_SU_FICHA_MS = 15_000;

/**
 * ¿Hay que pedir las sesiones de la lista para la conversación abierta?
 *
 * Una conversación que NACE mientras la pantalla está abierta —un cliente que
 * escribe por primera vez— no está en las sesiones que la lista trajo al
 * cargar, y el reloj de sesiones va a 60 s. Hasta entonces su fila salía sin
 * etapa ni calificación, y releer su etapa (arriba) no tenía sesión con la que
 * hacerlo: justo la conversación que más cambia en sus primeros minutos era la
 * que no se enteraba de nada.
 *
 * Se piden con la MISMA consulta de la lista —la que filtra las etiquetas por
 * quién puede verlas—, nunca armando la fila desde la sesión de la cabecera.
 * Solo cuando entra un mensaje en una conversación abierta SIN ficha, y como
 * mucho una vez cada `ESPERA_PARA_PEDIR_SU_FICHA_MS` por conversación: no es un
 * reloj nuevo.
 */
export function hayQuePedirSuFicha(tieneFicha: boolean, ultimaVez: number | undefined, ahora: number): boolean {
    if (tieneFicha) return false;
    return ultimaVez === undefined || ahora - ultimaVez >= ESPERA_PARA_PEDIR_SU_FICHA_MS;
}
