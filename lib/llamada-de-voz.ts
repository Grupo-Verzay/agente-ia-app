/**
 * Llamada de voz entre dos personas, dentro de un directo del chat de equipo.
 *
 * Navegador a navegador, sin WhatsApp, sin teléfono, sin video y sin salas.
 *
 * Puro a propósito: de aquí tiran la pantalla —que es cliente—, las acciones y
 * el banco. Es el mismo reparto de `canales-de-equipo` con `chat-de-equipo-db`.
 *
 * # Por qué la señalización va por la BASE y no por un socket
 *
 * El socket de tiempo real **no es nuestro**: `/api/realtime/token` solo firma
 * un token para ESCUCHAR el socket.io del backend, que es otro repositorio.
 * Mandar una oferta SDP por ahí sería tocarlo.
 *
 * Y no hace falta, porque el WebRTC de esta App ya es **non-trickle**: igual que
 * `CallDialog`, se espera a que ICE termine de recolectar y se manda **una sola
 * oferta**. Por el canal viajan dos mensajes —oferta y respuesta—, no un goteo
 * de candidatos, así que un reloj basta.
 *
 * Lo que cuesta, y hay que saberlo: **el timbre tarda hasta una vuelta**. Con
 * tres segundos, quien llama puede esperar eso a que suene al otro lado.
 */

/** Cada cuánto pregunta el oyente de llamadas. Ver el comentario de arriba. */
export const CADA_CUANTO_ESCUCHA_MS = 3_000;

/**
 * Cuánto se da por presente a alguien desde su último latido.
 *
 * Tres vueltas de margen: con una sola, una vuelta que tarde —la pestaña
 * ocupada, la red— dejaría a alguien «no disponible» estando delante, y eso se
 * ve como que la función no funciona.
 */
export const MARGEN_DE_PRESENCIA_MS = 3 * CADA_CUANTO_ESCUCHA_MS + 20_000;

/**
 * Cuánto suena antes de rendirse.
 *
 * Y **se decide en el servidor, por la hora de la fila**, no con un contador en
 * la pantalla de quien llama: si esa pestaña se cierra a mitad, la llamada se
 * quedaría sonando para siempre en la otra punta.
 */
export const TIMBRE_MAXIMO_MS = 45_000;

/** En qué punto está una llamada. */
export const ESTADOS = ["sonando", "en_curso", "terminada"] as const;
export type EstadoDeLlamada = (typeof ESTADOS)[number];

/**
 * Cómo acabó. Es lo que se escribe en el directo, así que la lista es cerrada:
 * un texto libre aquí no se podría contar ni traducir.
 */
export const FINALES = [
    "contestada",
    "rechazada",
    "sin_respuesta",
    "no_disponible",
    "sin_conexion",
] as const;
export type FinDeLlamada = (typeof FINALES)[number];

export function esFinDeLlamada(v: unknown): v is FinDeLlamada {
    return typeof v === "string" && (FINALES as readonly string[]).includes(v);
}

/**
 * Si alguien está delante de la plataforma ahora mismo.
 *
 * El latido lo deja el MISMO reloj que escucha las llamadas: cada vuelta pasa
 * por el servidor de todas formas, así que la presencia sale gratis y no hay
 * un sistema aparte que mantener.
 *
 * Sin latido —nunca ha abierto, o cerró hace rato— **no está disponible**, que
 * es el lado seguro: mejor decir «no está» y que conteste el teléfono de
 * siempre, que dejar a alguien escuchando un tono que no suena en ningún sitio.
 */
export function estaDisponible(
    vistoEn: Date | string | null | undefined,
    ahora: number = Date.now(),
): boolean {
    if (!vistoEn) return false;
    const marca = vistoEn instanceof Date ? vistoEn.getTime() : Date.parse(String(vistoEn));
    if (!Number.isFinite(marca)) return false;
    return ahora - marca <= MARGEN_DE_PRESENCIA_MS;
}

/**
 * Si una llamada que suena ya se pasó de tiempo.
 *
 * Se mira contra la hora en que se creó la fila, que es la única que las dos
 * puntas comparten.
 */
export function seLePasoElTimbre(
    creadaEn: Date | string,
    ahora: number = Date.now(),
): boolean {
    const marca = creadaEn instanceof Date ? creadaEn.getTime() : Date.parse(String(creadaEn));
    if (!Number.isFinite(marca)) return false;
    return ahora - marca > TIMBRE_MAXIMO_MS;
}

/**
 * Cuánto duró, en segundos.
 *
 * **Desde que se CONTESTÓ**, no desde que se llamó: el rato que estuvo sonando
 * no es tiempo de conversación, y contarlo haría que una llamada de diez
 * segundos que tardó treinta en contestarse saliera como de cuarenta.
 *
 * Sin contestar son cero segundos, y eso es un dato: la fila del directo dirá
 * «no contestada», no «0:00 de conversación».
 */
export function duracionEnSegundos(
    contestadaEn: Date | string | null | undefined,
    terminadaEn: Date | string | null | undefined,
): number {
    if (!contestadaEn || !terminadaEn) return 0;
    const a = contestadaEn instanceof Date ? contestadaEn.getTime() : Date.parse(String(contestadaEn));
    const b = terminadaEn instanceof Date ? terminadaEn.getTime() : Date.parse(String(terminadaEn));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(0, Math.round((b - a) / 1000));
}

/** `3:07`. Con los segundos a dos cifras, que si no se lee como 3,7 minutos. */
export function comoSeLeeLaDuracion(segundos: number): string {
    const seguros = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0;
    const min = Math.floor(seguros / 60);
    const seg = seguros % 60;
    return `${min}:${String(seg).padStart(2, "0")}`;
}

/**
 * Lo que queda escrito en el directo.
 *
 * **Se escribe como un mensaje más**, no como una tabla aparte: así sale en el
 * hilo, en su sitio por fecha, y lo lee el mismo lector de siempre. Lo que lo
 * distingue son dos columnas (`llamadaFin`, `llamadaSegundos`), como la tarjeta
 * de una conversación compartida.
 *
 * Y el texto se compone **aquí**, en un solo sitio, para que las dos puntas
 * escriban lo mismo: quien cuelga es una u otra según quién colgara antes, y
 * dos redacciones darían dos versiones del mismo hecho.
 */
export function comoSeCuentaLaLlamada(fin: FinDeLlamada, segundos: number): string {
    switch (fin) {
        case "contestada":
            return `Llamada de voz · ${comoSeLeeLaDuracion(segundos)}`;
        case "rechazada":
            return "Llamada de voz · rechazada";
        case "sin_respuesta":
            return "Llamada de voz · sin respuesta";
        case "no_disponible":
            return "Llamada de voz · no estaba disponible";
        case "sin_conexion":
            // El caso de las dos redes que no dejan conectar directo. Se dice
            // con todas las letras: sin TURN no hay ruta para el audio, y
            // «se cortó» mandaría a buscar el fallo donde no está.
            return "Llamada de voz · no se pudo conectar";
    }
}

/**
 * Los servidores ICE, leídos del entorno.
 *
 * **STUN siempre** —es lo que ya usa `CallDialog`— y **TURN solo si está
 * configurado**. Así la función no depende de levantar un servidor: con solo
 * STUN se conecta directo siempre que se pueda, que es lo pedido, y el día que
 * haga falta TURN son tres variables de entorno y **ni una línea de código**.
 *
 * Y conviene tenerlo claro: **STUN no transporta audio**. Solo dice cuál es tu
 * dirección pública. Cuando las dos puntas están detrás de NAT simétrico no
 * existe ruta directa y la llamada **no conecta** — eso es TURN, y sin él ese
 * porcentaje de llamadas se pierde. Lo que no puede pasar es que se pierda en
 * silencio: de ahí `sin_conexion`.
 */
export function losServidoresIce(env: {
    TURN_URL?: string | null;
    TURN_USER?: string | null;
    TURN_PASSWORD?: string | null;
}): RTCIceServer[] {
    const ice: RTCIceServer[] = [
        { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    ];

    const url = env.TURN_URL?.trim();
    if (url) {
        ice.push({
            urls: url.split(",").map((u) => u.trim()).filter(Boolean),
            username: env.TURN_USER?.trim() || undefined,
            credential: env.TURN_PASSWORD?.trim() || undefined,
        });
    }
    return ice;
}

/**
 * Con quién se habla en un directo.
 *
 * Devuelve `null` cuando el canal no es un directo o no tiene exactamente dos
 * miembros: **no se llama a un canal de varias personas**, y con tres dentro no
 * hay «el otro». Es la puerta que mantiene esto en uno a uno.
 */
export function laOtraPersona(canal: {
    tipo: string;
    miembros: string[];
}, yo: string): string | null {
    if (canal.tipo !== "directo") return null;
    const dentro = Array.from(new Set(canal.miembros.filter(Boolean)));
    if (dentro.length !== 2 || !dentro.includes(yo)) return null;
    return dentro.find((m) => m !== yo) ?? null;
}
