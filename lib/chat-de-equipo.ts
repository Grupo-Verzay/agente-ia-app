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
    autorId: string;
    /**
     * Se guarda junto al mensaje para que siga diciendo quién escribió aunque
     * esa persona salga del equipo. Mismo criterio que los comentarios de
     * tarea y que `assignedToName`.
     */
    autorNombre: string | null;
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
