/**
 * El chat interno del equipo. Solo tipos, constantes y lo que se puede probar
 * sin levantar nada.
 *
 * # Qué es, y qué NO es
 *
 * **Un hilo por cuenta**, donde escriben las personas de esa cuenta con su
 * propia identidad. Sin canales y sin temas: eso se añade el día que haga
 * falta, y añadirlo antes obliga a elegir por alguien que todavía no lo ha
 * pedido.
 *
 * Y no es ninguna de las dos cosas que ya había, que es justo lo que faltaba:
 * los **comentarios de tarea** son una conversación atada a una tarea, y las
 * **notas internas** de un chat son una conversación atada a un lead. Hasta
 * ahora no existía ningún sitio para hablar de otra cosa.
 *
 * # Puro a propósito
 *
 * De aquí tira la pantalla, que es un componente de cliente, y el módulo de al
 * lado (`lib/chat-de-equipo-db.ts`) importa Prisma. Es el mismo reparto que
 * `avisos-de-tarea-tipos` con `avisos-de-tarea`.
 */

/**
 * Cuánto se deja escribir de una vez.
 *
 * El mismo tope que un comentario de tarea, y por el mismo motivo: una mención
 * mete este texto dentro de la ventana que interrumpe, y un texto sin límite la
 * desborda y tapa la pantalla entera.
 */
export const TOPE_DEL_MENSAJE = 2000;

/** Cuántos mensajes se traen de golpe. */
export const TOPE_DE_MENSAJES = 200;

/**
 * Cada cuánto se refresca el hilo abierto.
 *
 * Corto y fijo, como el reloj del chat abierto de la bandeja: **el reloj
 * responde**. Aquí no hay tiempo real que lo adelante, así que este número es
 * lo único que trae los mensajes de los demás.
 */
export const CADA_CUANTO_MS = 5_000;

export type MensajeDeEquipo = {
    id: string;
    /**
     * Quién escribió: **la PERSONA**, no la cuenta.
     *
     * Dentro de una cuenta ajena por «Ingresar», `currentUser()` devuelve la
     * fila de ESA cuenta, así que firmar con ella dejaba el mensaje a nombre
     * del cliente y el equipo no sabía quién había hablado. Un mensaje lo
     * escribe alguien, y ese alguien tiene nombre.
     */
    autorId: string;
    /**
     * Se guarda junto al mensaje para que siga diciendo quién escribió aunque
     * esa persona salga del equipo. Mismo criterio que los comentarios de
     * tarea y que `assignedToName`.
     */
    autorNombre: string | null;
    /**
     * Desde qué cuenta se escribió, **solo cuando no es la de quien firma**.
     *
     * Es el rastro de haber entrado con «Ingresar». No se pierde —quién actuó
     * por quién es un dato— pero no se pinta: lo que se lee es quién habló.
     */
    escritoDesde: string | null;
    texto: string;
    /** A quién se mencionó. Es lo que decide a quién le saltó el aviso. */
    mencionados: string[];
    creadoEn: string;
};

/** Lo mínimo que hace falta saber de alguien para mencionarlo. */
export type PersonaMencionable = {
    id: string;
    name: string | null;
    email: string;
};

/** Cómo se le llama a alguien cuando no tiene nombre puesto. */
export function comoSeLlama(persona: PersonaMencionable): string {
    return persona.name?.trim() || persona.email;
}

/**
 * Quiénes están mencionados en un texto.
 *
 * **La lista de gente manda, no el texto.** Se busca `@` seguido del nombre de
 * alguien del equipo; lo que no case con nadie no es una mención, es una
 * arroba. Sin eso, escribir un correo («escríbele a hola@verzay.com») avisaría
 * a quien no toca, y avisar de más es lo que enseña a ignorar los avisos.
 *
 * Es la misma condición que ya usan las notas internas de un chat —allí se
 * comprueba `content.includes('@' + a.name)` antes de guardar—, escrita aquí
 * una sola vez y en el SERVIDOR: lo que llegue del navegador diciendo a quién
 * mencionó no se da por bueno.
 *
 * Se mira el nombre y también el correo, porque alguien sin nombre puesto sale
 * en la lista por su correo y es así como se le va a escribir.
 */
export function extraerMenciones(
    texto: string,
    equipo: PersonaMencionable[],
): string[] {
    const plano = String(texto ?? "");
    if (!plano.includes("@")) return [];

    const encontrados = new Set<string>();
    for (const persona of equipo) {
        for (const forma of [persona.name, persona.email]) {
            const limpio = forma?.trim();
            if (!limpio) continue;
            if (plano.includes(`@${limpio}`)) {
                encontrados.add(persona.id);
                break;
            }
        }
    }
    return [...encontrados];
}

/** Lo que se puede guardar de un texto: recortado y sin espacios de sobra. */
export function comoSeGuardaElTexto(texto: unknown): string {
    return String(texto ?? "").trim().slice(0, TOPE_DEL_MENSAJE);
}

/** Lo que `currentUser()` aporta para decidir quién firma y en qué hilo. */
export type QuienEscribe = {
    id?: string | null;
    name?: string | null;
    ownerId?: string | null;
    sessionUserId?: string | null;
    nombreDeLaPersona?: string | null;
    porImpersonacion?: boolean | null;
};

export type Firma = {
    /** Quién escribió: la PERSONA. */
    personaId: string;
    nombre: string | null;
    /** El hilo: la CUENTA. */
    cuentaId: string;
    /** Desde qué cuenta, solo si no es la de quien firma. */
    escritoDesde: string | null;
};

/**
 * Quién firma un mensaje y en qué hilo cae.
 *
 * **Firma la PERSONA, no la cuenta.** `currentUser()` devuelve la fila de la
 * cuenta EFECTIVA, así que dentro de una cuenta ajena por «Ingresar» firmar con
 * ella dejaba el mensaje a nombre del cliente y el equipo no sabía quién había
 * hablado. Un mensaje lo escribe alguien, y ese alguien tiene nombre:
 * `sessionUserId` y `nombreDeLaPersona` son siempre los de quien está sentado
 * delante.
 *
 * **El hilo sigue siendo el de la CUENTA.** Son dos preguntas distintas y es
 * justo lo que pide el caso: se entra a una cuenta ajena para ver lo suyo —su
 * hilo—, y lo que se escriba ahí lo lee su equipo, con el nombre de quien lo
 * escribió.
 *
 * Y no se pierde de dónde salió: `escritoDesde` guarda la cuenta, **solo
 * cuando de verdad son dos distintas**. Escribiéndolo siempre sería ruido en
 * todas las filas para el caso que nunca pasa.
 *
 * Es puro para poder probarlo sin levantar nada, que es lo que hace falta:
 * este es exactamente el sitio donde un despiste firma con quien no es.
 */
export function quienFirma(user: QuienEscribe): Firma | null {
    const idEfectivo = user?.id?.trim();
    if (!idEfectivo) return null;

    const personaId = user.sessionUserId?.trim() || idEfectivo;
    const cuentaId = user.ownerId?.trim() || idEfectivo;

    // El nombre de la persona real. Cuando la fila efectiva YA es la suya
    // —el caso normal, y el del conmutador de cuentas— su `name` sirve igual.
    const nombre =
        user.nombreDeLaPersona?.trim() ||
        (personaId === idEfectivo ? user.name?.trim() || null : null);

    return {
        personaId,
        nombre: nombre || null,
        cuentaId,
        escritoDesde: user.porImpersonacion ? cuentaId : null,
    };
}
