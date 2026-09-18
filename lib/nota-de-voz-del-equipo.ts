/**
 * Las reglas de una nota de voz del chat del equipo.
 *
 * Puro a propósito, como el resto de lo que decide algo en esta pantalla: de
 * aquí tiran la acción —que es servidor— y el banco. Lo que toca la base vive
 * en `lib/chat-de-equipo-db.ts` y el cobro en `lib/creditos-de-transcripcion.ts`.
 *
 * **La tarifa no se vuelve a escribir aquí**: es la misma de Chats,
 * `costoDeLaNota` en `lib/transcripcion-de-voz.ts` —seis créditos por minuto,
 * prorrateados por segundos—. Con una segunda cuenta en este fichero, el día
 * que cambie el precio una de las dos pantallas cobraría otra cosa, y eso no se
 * ve: se nota meses después en la factura.
 */

import { llaveDelArchivoSubido } from "@/lib/llave-del-bucket";
/**
 * El techo de lo que se guarda como duración, en segundos.
 *
 * **No es el tope de lo transcribible** —ese es `TOPE_DE_SEGUNDOS` y vale diez
 * minutos—: esto solo evita que llegue un entero imposible desde el navegador.
 * Recortar aquí al tope de verdad sería peor que no recortar, porque una nota
 * de media hora entraría como de diez minutos y se cobraría diez por
 * transcribir treinta.
 */
export const TECHO_DE_SEGUNDOS = 6 * 60 * 60;

/**
 * Quién PAGA la transcripción.
 *
 * Nunca la persona: **la cuenta a la que pertenece**, y dentro de una familia
 * de cuentas vinculadas, la **madre**. O sea, en el chat interno de Grupo
 * Verzay lo paga Grupo Verzay, escriba quien escriba desde Atención o Ventas.
 *
 * Los créditos son de una cuenta y no de un asesor: `ia_credits` tiene una fila
 * por cuenta, así que cobrarle a la persona sería cobrarle a una fila que
 * normalmente no existe — y entonces `losCreditosQueQuedan` devolvería 0 y
 * nadie podría transcribir nada. Es la misma razón por la que las notas de voz
 * de Chats las paga la cuenta dueña de la línea y no quien abre el chat.
 *
 * Y la **raíz de la familia**, no la cuenta suelta: `ownerId ?? id` **no sube a
 * la madre** —una cuenta vinculada por `linked_accounts` es de primer nivel y
 * no tiene `ownerId`—, así que sin esto el chat de la casa cobraría a tres
 * bolsas distintas según quién pulsara el botón. Es la misma asimetría que
 * partió el General en dos.
 */
export function laCuentaQuePagaLaTranscripcion(input: {
    /** La cuenta de la persona: `ownerId ?? id`. */
    cuentaId: string;
    /** La raíz de su familia, si se pudo resolver. */
    raizDeLaFamilia?: string | null;
}): string {
    return (input.raizDeLaFamilia ?? "").trim() || input.cuentaId;
}

/**
 * Quién puede PEDIR la transcripción de una nota.
 *
 * **Pertenecer, no poder leer**, y la diferencia es la que se pidió: un
 * administrador lee todos los directos de su cuenta —decisión tomada a
 * propósito— y eso no le deja gastar créditos transcribiendo la conversación de
 * otros dos. Es el mismo reparto con el que ya se cuenta lo sin leer y con el
 * que suena el aviso: sobre los canales donde se **pertenece**, no sobre los
 * que se alcanzan.
 *
 * El general lo tiene todo el mundo (`pertenezco: true`), así que esto no cierra
 * nada que estuviera abierto: lo único que deja fuera es el directo ajeno.
 */
export function puedePedirLaTranscripcion(canal: { pertenezco: boolean }): boolean {
    return canal.pertenezco;
}

/** Lo que se lee en el botón, con el precio delante para que no sorprenda. */
export function comoSeLeeElCosto(creditos: number): string {
    return creditos === 1 ? "1 crédito" : `${creditos} créditos`;
}

/**
 * Cuánto dura la nota, en el formato del reproductor.
 *
 * Se pinta al lado del audio porque **la duración es el precio**: seis créditos
 * por minuto prorrateado, así que ver «2:40» antes de pulsar es ver lo que va a
 * costar. Sin ella, el botón pide un cheque en blanco.
 */
export function comoSeLeeLaDuracion(segundos: number): string {
    const seguros = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0;
    const min = Math.floor(seguros / 60);
    const seg = seguros % 60;
    return `${min}:${String(seg).padStart(2, "0")}`;
}

/**
 * Lo que se guarda de una nota que llega del NAVEGADOR.
 *
 * Devuelve `null` —no hay nota— salvo que la dirección sea de **nuestro**
 * bucket y con la forma exacta que escribe `/api/upload`. Lo decide
 * `llaveDelArchivoSubido`, que es la misma función que ya guarda la ruta que
 * borra del bucket: una sola regla sobre qué direcciones son nuestras, no dos.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **La dirección no se da por buena por venir de una sesión.** Con una
 *    ajena dentro, la burbuja pintaría un `<audio>` apuntando a donde le
 *    dijeran, y el botón de transcribir mandaría a nuestro servidor a
 *    descargar esa dirección — o sea una petición que sale de dentro de la red
 *    y cuyo destino elige quien la manda.
 * 2. **Los segundos se acotan, pero NO al tope de lo transcribible.** Es lo que
 *    decide el precio, así que un número inventado desde el navegador sería el
 *    costo que quisiera quien lo manda. Pero recortarlos a `TOPE_DE_SEGUNDOS`
 *    era peor que no acotarlos: una nota de media hora se guardaba como de
 *    diez minutos, y entonces `queHacerConLaNota` la daba por transcribible y
 *    **cobraba diez minutos por transcribir treinta**. El techo es un absurdo
 *    (`TECHO_DE_SEGUNDOS`, seis horas) que solo evita un entero imposible; lo
 *    que decide si se transcribe sigue siendo la regla de Chats, con la
 *    duración de verdad delante.
 * 3. **El `mime` es solo para el reproductor.** No decide nada, así que basta
 *    con que lo parezca; lo que decide el formato al transcribir es la
 *    extensión del nombre, que sale de la propia llave del bucket.
 */
export function comoSeGuardaLaNota(
    pedida: { url?: string; segundos?: number; mime?: string | null } | null | undefined,
    bucket: { publicUrl: string | undefined; nombre: string },
): { url: string; segundos: number; mime: string | null } | null {
    const url = (pedida?.url ?? "").trim();
    if (!url) return null;
    if (!llaveDelArchivoSubido(url, bucket.publicUrl, bucket.nombre)) return null;

    const crudos = Number(pedida?.segundos);
    const segundos =
        Number.isFinite(crudos) && crudos > 0
            ? Math.min(Math.floor(crudos), TECHO_DE_SEGUNDOS)
            : 0;

    const mime = (pedida?.mime ?? "").trim();
    return {
        url,
        segundos,
        mime: mime.startsWith("audio/") ? mime.slice(0, 80) : null,
    };
}
