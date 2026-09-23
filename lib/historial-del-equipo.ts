/**
 * Limpiar el historial de una conversación del chat de equipo, y el caso que
 * la usa sin que nadie pulse nada: un PUESTO que cambia de ocupante.
 *
 * Puro: aquí solo se decide QUÉ se hace y QUÉ se le dice a quien lo hace. El
 * borrado vive en `lib/historial-del-equipo.server.ts`.
 *
 * # Por qué un puesto necesita esto
 *
 * Un directo es la pareja **ordenada de ids** (`llaveDelDirecto`), y un id es
 * una FILA de `User`, no una persona. Cuando alguien deja su puesto y otra
 * persona entra en su lugar **con el mismo usuario** —Equipo › Editar asesor,
 * cambiando el correo— la fila es la misma, así que el directo también: la
 * persona nueva abría el chat y leía la conversación privada de quien estuvo
 * antes. Sin un solo error, porque para la base no ha cambiado nada.
 *
 * Borrar al asesor y crear otro no tiene ese problema —el id nuevo abre
 * directos nuevos—, y por eso esto solo hace falta al EDITAR.
 */

import type { TipoDeCanal } from "@/lib/canales-de-equipo";

/**
 * La palabra que hay que teclear para confirmar.
 *
 * Es un borrado de verdad —`DELETE`, sin papelera— y en un canal se lleva los
 * mensajes de todo el mundo. Un botón de «Aceptar» se pulsa sin leer; teclear
 * una palabra no. Es el mismo patrón que «VACIAR» en Finanzas.
 */
export const PALABRA_PARA_LIMPIAR = "LIMPIAR";

/** Si lo tecleado confirma la limpieza. Sin mayúsculas obligatorias ni espacios. */
export function confirmaLaLimpieza(texto: unknown): boolean {
    return String(texto ?? "").trim().toUpperCase() === PALABRA_PARA_LIMPIAR;
}

/**
 * Lo que se le advierte a quien va a limpiar, según qué conversación sea.
 *
 * Las dos frases que no pueden faltar —y el banco las comprueba— son que es
 * **irreversible** y, en un canal, que **afecta a todos sus miembros**: quien
 * limpia lo hace desde SU pantalla y lo natural es pensar que solo se vacía lo
 * suyo. `personas` es cuánta gente hay dentro, si se sabe.
 */
export function laAdvertenciaDeLimpiar(input: {
    tipo: TipoDeCanal;
    nombre: string;
    personas?: number;
}): string {
    const irreversible = "No se puede deshacer: los mensajes, las notas de voz y los archivos se borran para siempre.";
    if (input.tipo === "directo") {
        return `Se borrará toda la conversación directa «${input.nombre}» para las dos personas. ${irreversible}`;
    }
    const cuantos =
        typeof input.personas === "number" && input.personas > 0
            ? ` (${input.personas} ${input.personas === 1 ? "persona" : "personas"})`
            : "";
    const donde = input.tipo === "general" ? "el canal General" : `el canal «${input.nombre}»`;
    return `Se borrará todo el historial de ${donde} para todos sus miembros${cuantos}, no solo para ti. ${irreversible}`;
}

/**
 * Si al editar un asesor hay que proponer que ENTRA OTRA PERSONA.
 *
 * El correo es el inicio de sesión, o sea la identidad: cambiarlo es, casi
 * siempre, darle el puesto a otra persona. **Es una propuesta, no la
 * decisión**: la casilla sale marcada y se puede desmarcar —la misma persona
 * puede cambiar de correo—, y el servidor solo actúa con la marca explícita.
 * Deducirlo en el servidor por el correo sería borrar conversaciones sin que
 * nadie lo haya pedido.
 */
export function sugiereNuevoOcupante(correoActual: string | null | undefined, correoPedido: string | null | undefined): boolean {
    const antes = String(correoActual ?? "").trim().toLowerCase();
    const ahora = String(correoPedido ?? "").trim().toLowerCase();
    return Boolean(antes && ahora && antes !== ahora);
}
