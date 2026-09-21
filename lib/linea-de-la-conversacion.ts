/**
 * Por qué línea sale lo que el asesor manda desde Chats.
 *
 * # El fallo
 *
 * Un cliente escribía por **Verzay Atención**, el asesor contestaba desde la
 * plataforma, y el mensaje salía por **otra línea**: la primera de su propia
 * cuenta. Lo mismo al llamar. Desde fuera no se lee como un error —el mensaje
 * sale, la burbuja aparece— se lee como que el cliente recibe la respuesta de
 * un número que no es al que escribió.
 *
 * La causa era un **respaldo**. La pantalla guardaba el juego de acciones de la
 * conversación en un `ref` que solo se escribía en UN camino —pulsar la fila en
 * la lista—; cualquier otra forma de abrir un chat (un enlace con `?jid=`, la
 * tarjeta de un chat compartido, un aviso) lo dejaba en `null`, y el envío caía
 * en `sendAnyAction`, que está atado a la línea que la PÁGINA eligió al cargar
 * (`pickWhatsappOrNull`, o sea la primera de la cuenta propia).
 *
 * > **La línea de salida es la de la CONVERSACIÓN, y se resuelve AL ENVIAR, no
 * > al seleccionar.** Un `ref` que solo escribe un camino es una respuesta que
 * > depende de por dónde se entró; lo que hay delante no cambia según eso.
 *
 * # Y no hay respaldo a otra línea
 *
 * Es la otra mitad, y es la que no se puede ablandar: cuando la línea de la
 * conversación se conoce y no hay con qué enviar por ella, **se dice y no se
 * envía**. Mandarlo por la línea de al lado es peor que no mandarlo: el
 * mensaje sale, nadie ve un error, y el cliente recibe un WhatsApp de un
 * número desconocido — que es exactamente lo que se reportó.
 *
 * Puro a propósito: lo decide el navegador en cada envío y lo comprueba el
 * banco sin levantar nada (`lib/__tests__/linea-de-la-conversacion.test.mjs`).
 */

/** Lo poco que hace falta saber de la conversación que está abierta. */
export type ConversacionAbierta = {
    /** La fila de la bandeja que se abrió, cuando está cargada. Es la verdad. */
    contacto?: { instanceName?: string | null } | null;
    /** La línea con la que se pulsó la fila (`selectedInstanceName`). */
    seleccionada?: string | null;
    /** Lo que quedó apuntado al abrir, incluido el aterrizaje de un enlace. */
    info?: { instanceName?: string | null } | null;
};

/** Cualquier cosa atada a una línea: un juego de acciones, un canal… */
export type AtadoALaLinea = { instanceName: string };

function comoNombreDeLinea(valor?: string | null): string | null {
    const nombre = (valor ?? "").trim();
    return nombre ? nombre : null;
}

/**
 * La línea por la que entró la conversación abierta.
 *
 * El orden no es indiferente y es el mismo que ya usaba la pantalla para la
 * presencia: **la fila manda**, porque el mismo número puede tener conversación
 * en dos líneas y la fila dice en cuál se pulsó. Después la línea con la que se
 * seleccionó, y al final lo apuntado al abrir.
 *
 * **Aquí no entra la línea por defecto de la página.** Es justo el valor que
 * causó el fallo: responde «la primera de tu cuenta» a una pregunta que es
 * «¿por cuál entró esta conversación?». Sin línea se devuelve `null`, que es
 * una respuesta y no un sustituto.
 */
export function laLineaDeLaConversacion(conversacion: ConversacionAbierta): string | null {
    return (
        comoNombreDeLinea(conversacion.contacto?.instanceName) ??
        comoNombreDeLinea(conversacion.seleccionada) ??
        comoNombreDeLinea(conversacion.info?.instanceName)
    );
}

export type PorDondeSale<T extends AtadoALaLinea> =
    /** Se sabe la línea y hay con qué enviar por ella. */
    | { motivo: "la-de-la-conversacion"; linea: string; juego: T }
    /** Se sabe la línea y NO hay juego suyo: no se envía por otra. */
    | { motivo: "sin-juego"; linea: string; juego: null }
    /** No se sabe por qué línea entró: quien llama decide, y lo dice. */
    | { motivo: "sin-linea"; linea: null; juego: null };

/**
 * Con qué se envía por la línea de la conversación.
 *
 * Devuelve tres casos y no dos a propósito: «no sé por qué línea entró» y «sé
 * por cuál y no tengo con qué» piden cosas distintas. El primero es el único
 * donde quien llama puede caer en lo que tuviera; el segundo **nunca**.
 */
export function porDondeSaleLaRespuesta<T extends AtadoALaLinea>(
    juegos: readonly T[] | undefined | null,
    conversacion: ConversacionAbierta,
): PorDondeSale<T> {
    const linea = laLineaDeLaConversacion(conversacion);
    if (!linea) return { motivo: "sin-linea", linea: null, juego: null };
    const juego = (juegos ?? []).find((j) => j.instanceName === linea);
    return juego
        ? { motivo: "la-de-la-conversacion", linea, juego }
        : { motivo: "sin-juego", linea, juego: null };
}

/**
 * Lo que se le dice a quien pulsó enviar cuando no se puede.
 *
 * Nombra la línea: «no se pudo enviar» a secas manda a mirar la red, y lo que
 * pasa es que esa línea no está disponible en esta pantalla —se desconectó, se
 * borró, o la cuenta dejó de estar vinculada—.
 */
export function porQueNoSeEnvia(salida: PorDondeSale<AtadoALaLinea>): string | null {
    if (salida.motivo !== "sin-juego") return null;
    return `Esta conversación entró por la línea «${salida.linea}» y ahora mismo no está disponible para responder. Recarga Chats o revisa su conexión.`;
}
