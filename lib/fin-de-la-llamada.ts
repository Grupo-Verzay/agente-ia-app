/**
 * Cuándo se acabó una llamada de WhatsApp, y en qué segundo exacto.
 *
 * El fallo que esto viene a arreglar: **el cliente colgaba y la tarjeta seguía
 * como si se estuviera hablando**, con el contador corriendo. El asesor creía
 * que seguía al teléfono, hablándole a nadie, hasta que se rendía y colgaba él;
 * y el registro de la llamada se quedaba con la duración de ese rato de más, no
 * con la que se habló.
 *
 * # Lo primero, porque despista: aquí no hay Evolution ni Waha
 *
 * La tarjeta de Chats llama por **AstraCalls** (una pasarela WebRTC) o por la
 * **Cloud API de Meta**, y no por las líneas de Evolution ni de Waha — Waha no
 * tiene API de llamadas y el `/call/offer` de Evolution está en una acción que
 * no importa nadie. Así que buscar «cómo se llama el evento de fin en cada uno»
 * no lleva a ningún sitio: no existe el camino.
 *
 * De ahí sale la forma de esto, y es la que además aguanta el día que se añada
 * otro proveedor:
 *
 * > **El detector principal es el AUDIO, no el proveedor.** Con una pasarela
 * > WebRTC, que el otro cuelgue **es** que el audio deja de llegar: da igual
 * > cómo llame cada uno a su evento. Lo del proveedor va encima, para poner
 * > nombre a lo que ya se sabe —y en Meta llega de verdad, por
 * > `chat_messages.raw.metaCall`—.
 *
 * # Y la regla que no se puede ablandar
 *
 * **Que falte información NUNCA termina una llamada.** Una consulta que no
 * contesta, un `getStats` que falla, un proveedor que no dice nada: eso es «no
 * sé», y colgarle a alguien por no saber es peor que el fallo original — se
 * corta una conversación en curso y no hay forma de recuperarla. Solo un dato
 * positivo cierra la tarjeta.
 */

/**
 * Cuánto se aguanta sin audio antes de dar la llamada por cortada.
 *
 * No puede ser corto: un bache de red de dos segundos es normal en un móvil y
 * cortar ahí sería colgarle al cliente en mitad de una frase. Y no puede ser
 * largo, que es el fallo del que venimos.
 *
 * Y lo que hace que seis segundos sean seguros, que es lo que hay que saber
 * antes de bajarlos: **una llamada callada sigue mandando bytes**. Opus con
 * DTX —lo que usa WhatsApp— no deja de transmitir cuando nadie habla, manda
 * ruido de confort un par de veces por segundo. Así que seis segundos sin un
 * solo byte no son «no está hablando»: son una docena larga de paquetes que no
 * llegaron, o sea que ya no hay quien los mande.
 */
export const GRACIA_SIN_AUDIO_MS = 6_000;

/**
 * Cuánto se aguanta en `disconnected` antes de darla por cortada.
 *
 * `disconnected` es el estado dudoso de WebRTC: significa «se perdió la ruta»,
 * y a veces se recupera solo al segundo. `failed` y `closed` son firmes y no
 * pasan por aquí.
 */
export const GRACIA_DESCONECTADA_MS = 5_000;

/** El rastro del audio que llega: cuántos bytes, y desde cuándo no suben. */
export type RastroDelAudio = {
    /** Los bytes recibidos la última vez que se miró. */
    bytes: number;
    /** Cuándo fue la última vez que ese número SUBIÓ. */
    desdeMs: number;
};

/**
 * Apunta lo que se acaba de leer del `getStats`.
 *
 * La clave está en qué reloj se guarda: **el del último byte nuevo**, no el de
 * ahora. Eso es lo que permite después contar la llamada hasta donde de verdad
 * se habló y no hasta que nos enteramos.
 */
export function rastrearElAudio(
    antes: RastroDelAudio | null,
    bytes: number,
    ahoraMs: number,
): RastroDelAudio {
    if (!antes) return { bytes, desdeMs: ahoraMs };
    // Estrictamente mayor: `bytesReceived` solo crece, así que repetido es
    // silencio. Y si bajara —otra conexión, un contador reiniciado— se trata
    // como novedad, que es el lado seguro: nunca cuelga por un número raro.
    if (bytes !== antes.bytes) return { bytes, desdeMs: ahoraMs };
    return antes;
}

/** Si el audio lleva callado más de lo que se aguanta. */
export function elAudioSeCorto(
    rastro: RastroDelAudio | null,
    ahoraMs: number,
    graciaMs: number = GRACIA_SIN_AUDIO_MS,
): boolean {
    // Sin rastro no se sabe nada, y no saber nunca cuelga.
    if (!rastro) return false;
    return ahoraMs - rastro.desdeMs >= graciaMs;
}

/**
 * Qué dice de la llamada el estado de la conexión.
 *
 * - `sigue`: todo bien, o todavía montándose.
 * - `espera`: se perdió la ruta y puede volver. Se aguanta un rato.
 * - `cortada`: firme. La otra punta se fue.
 */
export function loQueDiceLaConexion(
    estado: string,
): "sigue" | "espera" | "cortada" {
    if (estado === "failed" || estado === "closed") return "cortada";
    if (estado === "disconnected") return "espera";
    return "sigue";
}

/**
 * Los segundos que se hablaron: de contestar a que se cortó el audio.
 *
 * Nunca hasta «ahora». Si el cliente colgó en el segundo 83 y nos enteramos en
 * el 89, el registro tiene que decir 83 — si no, cada llamada de la plataforma
 * sale seis segundos más larga de lo que fue y los informes cuentan un tiempo
 * que nadie pasó al teléfono.
 */
export function losSegundosHablados(desdeMs: number, hastaMs: number): number {
    if (!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs)) return 0;
    return Math.max(0, Math.floor((hastaMs - desdeMs) / 1000));
}

/** Lo que el proveedor cuenta de una llamada que ya terminó. */
export type LoQueDiceElProveedor = {
    /** Si el proveedor dice que esta llamada ya no está en curso. */
    terminada: boolean;
    /**
     * Los segundos que él contó, si los da.
     *
     * `undefined` es «no los dijo» y **no es cero**: dar por cero una llamada
     * de tres minutos porque el proveedor no puso el campo la borraría del
     * registro de tiempo hablado.
     */
    segundos?: number;
    /** Su explicación, tal cual, para enseñarla. Vacía si no dio ninguna. */
    motivo?: string;
    /** Si terminó mal (rechazada, no contestada, error de la pasarela). */
    fallo: boolean;
};

/**
 * Lee el parte de llamada de Meta (`chat_messages.raw.metaCall`).
 *
 * Es el único proveedor de los dos que de verdad **reporta** el fin: su webhook
 * llega al backend y este lo guarda en la fila `meta_call_<id>`, que es de
 * donde ya se sacaba la respuesta de audio. Se lee a la defensiva —campos que
 * pueden venir en dos formas, estados en cualquier caja— porque lo que llega es
 * de fuera y una forma inesperada no puede ser una excepción en mitad de una
 * llamada.
 *
 * Y **no se inventa la diferencia entre «rechazó» y «no contestó»**: si Meta la
 * dice, se enseña con sus palabras; si no, lo único cierto es que la llamada
 * acabó sin conversación, que es lo que la tarjeta ya sabe contar.
 */
export function loQueDiceMeta(metaCall: unknown): LoQueDiceElProveedor | null {
    if (!metaCall || typeof metaCall !== "object") return null;
    const parte = metaCall as Record<string, unknown>;

    const evento = String(parte.event ?? "").toLowerCase();
    const estado = String(parte.status ?? "").toUpperCase();
    if (evento !== "terminate") return null;

    const motivo = Array.isArray(parte.errors)
        ? (parte.errors as Array<Record<string, unknown>>)
              .map((e) => e?.message || e?.title)
              .filter(Boolean)
              .join(" ")
              .trim()
        : "";

    const crudo = parte.duration;
    const numero = typeof crudo === "string" ? Number(crudo) : crudo;
    const segundos =
        typeof numero === "number" && Number.isFinite(numero) && numero >= 0
            ? Math.floor(numero)
            : undefined;

    return {
        terminada: true,
        segundos,
        motivo: motivo || undefined,
        // Solo `COMPLETED` es un final bueno. Cualquier otra cosa —`FAILED`, o
        // un estado que no conozcamos— se trata como que algo fue mal, que es
        // el lado que hace que se le enseñe el motivo al asesor en vez de
        // callárselo.
        fallo: estado !== "COMPLETED",
    };
}
