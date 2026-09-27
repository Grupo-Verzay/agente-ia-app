/**
 * # Mencionar a un compañero dentro de una conversación de Chats
 *
 * Una nota interna con `@Nombre` hace tres cosas, y ninguna más:
 *
 * 1. le **avisa** a esa persona (la campanita, «Menciones»);
 * 2. si es un **agente** —que solo ve lo suyo—, le **abre esa conversación**
 *    concreta: puede entrar y leerla sin que cambie de dueño y **sin que salga
 *    en su lista** de chats asignados;
 * 3. y ese acceso **dura mientras la conversación siga abierta**: lo quita a
 *    mano el dueño, y se va solo en cuanto alguien la marca como resuelta.
 *
 * Es **independiente de transferir, asignar y agregar participante**, que
 * siguen igual. Una mención no mueve la conversación de nadie.
 *
 * Puro y sin imports: lo prueba el banco sin base ni navegador, y lo usan el
 * servidor (quién recibe acceso, quién lo puede quitar, si sigue vigente) y la
 * pantalla (a dónde lleva el aviso y qué se enseña al abrir).
 */

/** Por qué una persona puede ver una conversación. `null` = no puede. */
export type MotivoDeAcceso =
    /** No es agente: ve todo lo de su cuenta, como siempre. */
    | "cuenta"
    /** La tiene asignada. */
    | "suya"
    /** Sin asesor, y puede tomar de la bolsa. */
    | "bolsa"
    /** Lo agregaron como participante (Acciones › Agregar participante). */
    | "participante"
    /** Lo mencionaron en una nota y la conversación sigue abierta. */
    | "mencion";

/**
 * Por qué ve la conversación, en orden: lo que ya existía manda sobre la
 * mención, así que una mención nunca le quita a nadie lo que tenía.
 */
export function porQueVeLaConversacion(x: {
    esAgente: boolean;
    personaId: string;
    asignadoA: string | null;
    puedeTomarSinAsignar: boolean;
    esParticipante: boolean;
    mencionVigente: boolean;
}): MotivoDeAcceso | null {
    if (!x.esAgente) return "cuenta";
    if (x.asignadoA && x.asignadoA === x.personaId) return "suya";
    if (!x.asignadoA && x.puedeTomarSinAsignar) return "bolsa";
    if (x.esParticipante) return "participante";
    if (x.mencionVigente) return "mencion";
    return null;
}

/**
 * ¿Sigue valiendo el acceso?
 *
 * Vale mientras la conversación no se haya resuelto **después** de la
 * mención. Resolver borra además la fila, pero esta comprobación no depende
 * de ese borrado: la marca de resuelta la pueden escribir otros caminos (el
 * backend, un lote, una macro), y una conversación cerrada no puede seguir
 * abierta para un invitado porque uno de ellos se olvidó de limpiar.
 *
 * Mencionar en una conversación ya resuelta sí da acceso: la mención es
 * posterior, y es justo lo que se quiere cuando se le pide ayuda a alguien
 * para reabrir un caso.
 */
export function laMencionSigueVigente(
    otorgadoEn: Date | number,
    resueltaEn: Date | number | null,
): boolean {
    if (resueltaEn === null || resueltaEn === undefined) return true;
    const otorgado = typeof otorgadoEn === "number" ? otorgadoEn : otorgadoEn.getTime();
    const resuelta = typeof resueltaEn === "number" ? resueltaEn : resueltaEn.getTime();
    if (!Number.isFinite(otorgado) || !Number.isFinite(resuelta)) return false;
    return resuelta < otorgado;
}

/**
 * Quién puede QUITAR un acceso por mención.
 *
 * «El dueño» de la conversación es el asesor que la tiene asignada; además
 * pueden quien administra la cuenta y quien dio el acceso (se equivocó de
 * persona). Y el propio invitado puede salirse. Nadie más: un agente
 * cualquiera no le cierra la puerta a otro.
 */
export function puedeQuitarElAcceso(x: {
    personaId: string;
    mandaEnLaCuenta: boolean;
    asignadoA: string | null;
    otorgadoPorId: string | null;
    delAcceso: string;
}): boolean {
    if (x.mandaEnLaCuenta) return true;
    if (x.asignadoA && x.asignadoA === x.personaId) return true;
    if (x.otorgadoPorId && x.otorgadoPorId === x.personaId) return true;
    return x.delAcceso === x.personaId;
}

/**
 * De los mencionados, a quién se le da acceso: **solo a los agentes del
 * equipo**, sin repetir y nunca a uno mismo.
 *
 * Quien no es agente ya ve todo lo de su cuenta, así que un acceso a su nombre
 * no le cambia nada y solo ensuciaría la lista de «Acceso por mención» con
 * gente que no lo necesita. Lo que llega del navegador no decide: quien no esté
 * en el equipo se cae aquí.
 */
export function quienesRecibenAcceso(
    mencionados: readonly string[],
    equipo: ReadonlyMap<string, { esAgente: boolean }>,
    yo: string,
): string[] {
    const salida: string[] = [];
    for (const id of mencionados) {
        if (!id || id === yo || salida.includes(id)) continue;
        if (equipo.get(id)?.esAgente) salida.push(id);
    }
    return salida;
}

/** A quién se le avisa: los del equipo, sin repetir y nunca a uno mismo. */
export function quienesRecibenElAviso(
    mencionados: readonly string[],
    equipo: ReadonlyMap<string, unknown>,
    yo: string,
): string[] {
    const salida: string[] = [];
    for (const id of mencionados) {
        if (!id || id === yo || salida.includes(id)) continue;
        if (equipo.has(id)) salida.push(id);
    }
    return salida;
}

/** El parámetro con el que el aviso dice «entras porque te mencionaron». */
export const PARAMETRO_DE_MENCION = "mencion";

/**
 * A dónde lleva el aviso de una mención. Lo usan la campanita del servidor y
 * la del navegador: con dos copias, una llevaría a la conversación y la otra a
 * la lista.
 *
 * Lleva el id de la conversación y no la línea: la línea la resuelve la página
 * a partir de la conversación (`collab_notifications` no guarda la línea, y es
 * una tabla del backend a la que no se le añaden columnas desde aquí).
 */
export function enlaceDeLaMencion(n: {
    remoteJid: string | null;
    sessionId: number | null;
}): string {
    if (!n.remoteJid) return "/chats";
    const jid = `/chats?jid=${encodeURIComponent(n.remoteJid)}`;
    return n.sessionId ? `${jid}&${PARAMETRO_DE_MENCION}=${n.sessionId}` : jid;
}

/** Lee el id de la conversación del parámetro; lo que no sea un entero, nada. */
export function comoSesionDeLaMencion(valor: unknown): number | null {
    const texto = Array.isArray(valor) ? valor[0] : valor;
    if (typeof texto !== "string" || !/^\d{1,10}$/.test(texto.trim())) return null;
    const n = Number(texto.trim());
    return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Qué enseña la pantalla a un agente que tiene delante una conversación que
 * no es suya:
 *
 * - `invitado`: entra por mención; se ve con el aviso de que no es suya.
 * - `sin-acceso`: entró por el aviso de una mención y ese acceso ya no está
 *   (se lo quitaron o se resolvió). No se le enseña la conversación.
 * - `normal`: cualquier otro camino, como hasta ahora. Una mención no cierra
 *   ninguna puerta que ya estuviera abierta.
 */
export type VistaDelInvitado = "normal" | "invitado" | "sin-acceso";

export function laVistaDelInvitado(x: {
    motivo: MotivoDeAcceso | null | undefined;
    /** Llegó por el enlace de una mención, o ya la estaba viendo como invitado. */
    entroPorMencion: boolean;
}): VistaDelInvitado {
    if (x.motivo === "mencion") return "invitado";
    // Mientras se pregunta (`undefined`) no se cierra nada: un tropiezo de red
    // no puede esconder una conversación que se estaba leyendo.
    if (x.motivo === undefined || x.motivo) return "normal";
    return x.entroPorMencion ? "sin-acceso" : "normal";
}
