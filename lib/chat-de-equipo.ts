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
import type { ChatCompartido } from "@/lib/chat-compartido";

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
    /**
     * La conversación de Chats que el mensaje señala, si señala alguna.
     *
     * Va como DATO y no como una dirección escrita dentro del texto: así quien
     * recibe puede comprobar el acceso **antes** de pintar el botón y decir por
     * qué no puede abrirla, en vez de ofrecer un enlace que aterriza en una
     * pantalla vacía. Ver `lib/chat-compartido.ts`.
     */
    chat?: ChatCompartido | null;
};

/** Lo mínimo que hace falta saber de alguien para mencionarlo. */
export type PersonaMencionable = {
    id: string;
    name: string | null;
    email: string;
    /**
     * Es una CUENTA de la familia, no alguien del equipo.
     *
     * Lo decide `soloLasPersonas`: las cuentas vinculadas son líneas y no salen
     * en DIRECTOS ni entre los mencionables. La raíz sí, porque es el inicio de
     * sesión del dueño.
     */
    esCuenta?: boolean;
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

/**
 * La arroba que se está escribiendo, si es que hay una.
 *
 * # Por qué es puro y por qué se prueba
 *
 * Porque **el selector no existía**: el `placeholder` decía «@ para mencionar»
 * y no había ninguna lista. La mención funcionaba solo si escribías el nombre
 * exacto, y nada te lo proponía. Esto es lo que decide cuándo ofrecerla, y
 * equivocarse aquí se ve de dos formas malas: una lista que sale cuando no
 * toca —al escribir un correo— o una que no sale nunca.
 *
 * # Las tres condiciones
 *
 * 1. **La arroba tiene que abrir palabra.** Ni justo después de una letra ni de
 *    un número: es la misma condición con la que el servidor decide que
 *    `hola@verzay.com` **no** es una mención, y las dos tienen que estar de
 *    acuerdo o la lista ofrecería a alguien que luego no se menciona.
 * 2. **Sin salto de línea dentro.** Lo que se escribe después de un Enter es
 *    otra frase, no la continuación del nombre.
 * 3. **Con un tope de largo.** Un nombre tiene dos o tres palabras; sin tope,
 *    un párrafo entero detrás de una arroba se quedaría buscando para siempre.
 */
export const TOPE_DE_LO_QUE_SE_BUSCA = 40;

export type ArrobaEnCurso = { desde: number; buscado: string };

export function laArrobaQueSeEscribe(
    texto: string,
    cursor: number,
): ArrobaEnCurso | null {
    const hasta = Math.max(0, Math.min(cursor, texto.length));
    const desde = texto.lastIndexOf("@", hasta - 1);
    if (desde < 0) return null;

    // Ni justo después de una letra o un número: eso es un correo, no una
    // mención. La misma condición que `extraerMenciones` aplica al leer.
    const antes = desde > 0 ? texto[desde - 1] : "";
    if (antes && /[\p{L}\p{N}]/u.test(antes)) return null;

    const buscado = texto.slice(desde + 1, hasta);
    if (buscado.includes("\n")) return null;
    if (buscado.length > TOPE_DE_LO_QUE_SE_BUSCA) return null;

    return { desde, buscado };
}

/**
 * A quién se le ofrece, para lo que se lleva escrito.
 *
 * Sin nada escrito salen todos —abrir la lista con solo `@` es lo que hace que
 * sirva para no tener que recordar el nombre—. Con algo escrito, se busca **en
 * el nombre y en el correo**, en cualquier parte y sin distinguir mayúsculas:
 * quien busca «silvera» tiene que encontrar a «Yair Silvera».
 */
export function aQuienSeOfrece(
    gente: PersonaMencionable[],
    buscado: string,
    tope = 8,
): PersonaMencionable[] {
    const q = buscado.trim().toLowerCase();
    const casan = q
        ? gente.filter(
              (p) =>
                  (p.name ?? "").toLowerCase().includes(q) ||
                  p.email.toLowerCase().includes(q),
          )
        : gente;
    return casan.slice(0, tope);
}

/**
 * El texto con la mención ya puesta, y dónde queda el cursor.
 *
 * Se escribe **el nombre tal cual**, que es la forma que el servidor reconoce
 * (`@` más el nombre o el correo, exacto). Y se deja un espacio detrás: sin él,
 * lo siguiente que se teclee se pega al nombre y deja de ser una mención.
 */
export function ponerLaMencion(
    texto: string,
    arroba: ArrobaEnCurso,
    persona: PersonaMencionable,
    cursor: number,
): { texto: string; cursor: number } {
    const nombre = comoSeLlama(persona);
    const antes = texto.slice(0, arroba.desde);
    const despues = texto.slice(Math.min(cursor, texto.length));
    const puesto = `@${nombre} `;
    return { texto: `${antes}${puesto}${despues}`, cursor: antes.length + puesto.length };
}
