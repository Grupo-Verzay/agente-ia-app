/**
 * Volver a una reunión después de un corte, sin tener que entrar otra vez.
 *
 * Puro a propósito, como el resto de lo que decide algo en esta suite
 * (`lib/sala-de-video.ts`, `lib/ventana-de-reunion.ts`): de aquí tiran la
 * malla, la acción que devuelve a alguien a su sitio y el banco.
 *
 * # Lo que fallaba, que eran DOS cosas y no una
 *
 * «Se me cayó internet un momento y la reunión no volvió» tenía dos causas
 * distintas, cada una con su ventana de tiempo:
 *
 * | cuánto duró el corte | qué pasaba |
 * | --- | --- |
 * | **menos de `MARGEN_EN_LA_SALA_MS`** (21 s) | el servidor no te saca, el reloj vuelve solo… y **las conexiones no**: una `RTCPeerConnection` en `failed` se quedaba en el mapa para siempre, y `comoQuedaLaMalla` la cuenta como montada, así que nadie la volvía a abrir. La sala seguía ahí y los recuadros en negro. |
 * | **más de eso** | el barrido te pone en `fuera`, la vuelta siguiente contesta «Ya no estás en esta reunión», y la malla cerraba todo y se rendía. Había que pulsar «Volver a entrar» — y **un invitado no tiene ese botón**. |
 *
 * Así que hacen falta las dos mitades: **sanar las conexiones muertas** y
 * **volver a la misma fila**. Con una sola, el corte corto se arregla y el
 * largo no, o al revés.
 *
 * # Y volver NO es pasar otra vez por la puerta
 *
 * Es la parte que no se puede ablandar. La regla de esta suite es que «tener el
 * enlace deja llamar a la puerta, y quien pasa lo decide alguien de dentro», y
 * eso sigue igual: al volver **no se crea ninguna fila**, se reanuda la que ya
 * había, que alguien admitió en su momento. Por eso `sePuedeReanudar` mira
 * **por qué** se salió: a quien sacaron, o quien se fue por su propio pie, no
 * vuelve solo.
 *
 * Sin esa distinción, la pestaña de alguien a quien acaban de echar volvería a
 * entrar sola dos segundos después, que es exactamente lo contrario de moderar.
 */

/**
 * Por qué una fila de participante dejó de estar dentro.
 *
 * Los tres caminos escribían `estado = 'fuera'` y nada más, así que **no había
 * forma de distinguirlos** — y los tres significan cosas muy distintas a la
 * hora de volver.
 */
export type MotivoDeSalida =
    /** El barrido: dejó de dar señales. Es el corte de red, y se reanuda. */
    | "silencio"
    /** Pulsó colgar. Salir significa salir. */
    | "salio"
    /** Le sacaron de dentro, o no le dejaron pasar. */
    | "sacado";

const MOTIVOS: readonly MotivoDeSalida[] = ["silencio", "salio", "sacado"];

export function esMotivoDeSalida(v: unknown): v is MotivoDeSalida {
    return typeof v === "string" && (MOTIVOS as readonly string[]).includes(v);
}

/**
 * Si una fila fuera de la sala se puede reanudar sola.
 *
 * **Solo el silencio.** Y lo que no se reconoce —una fila vieja, de antes de
 * que existiera la columna— tampoco: se ve de menos, nunca de más. Quien no
 * pueda reanudar sigue teniendo su botón de volver a entrar a mano, que es lo
 * que había antes de esto.
 */
export function sePuedeReanudar(motivo: unknown): boolean {
    return motivo === "silencio";
}

// ── La salud de una conexión ────────────────────────────────────────────────

/**
 * Cuánto se le perdona a una conexión en `disconnected`.
 *
 * `disconnected` es el estado **dudoso** de WebRTC: un bache de red lo dispara
 * y se recupera solo al segundo siguiente. Tirar la conexión ahí sería
 * renegociar media reunión cada vez que alguien pasa por debajo de un puente.
 *
 * `failed` y `closed`, en cambio, son firmes y no se perdonan: de ahí no se
 * vuelve sin una conexión nueva. Es el mismo reparto que ya hace la llamada de
 * voz de Chats con su `fin-de-la-llamada`.
 */
export const GRACIA_DE_DISCONNECTED_MS = 6_000;

/**
 * Si una conexión está muerta y hay que volver a montarla.
 *
 * `desdeMs` es cuánto lleva en ese estado, no cuánto lleva viva.
 */
export function estaMuertaLaConexion(input: {
    estado: string;
    desdeMs: number;
}): boolean {
    if (input.estado === "failed" || input.estado === "closed") return true;
    if (input.estado === "disconnected") return input.desdeMs >= GRACIA_DE_DISCONNECTED_MS;
    return false;
}

/**
 * Si una conexión hay que rehacerla porque la otra persona RE-ENTRÓ.
 *
 * Cuando a alguien se le cae la red y vuelve, el que no ofrece podría quedarse
 * con una conexión que a él le parece viva esperando una oferta que el otro no
 * cree deber; hay que tirarla y volver a montarla. La pregunta es «¿esta
 * conexión es de una sesión ANTERIOR de esa persona?».
 *
 * # Se compara SELLO contra SELLO, nunca sello contra `Date.now()`
 *
 * Antes esto restaba la hora de entrada de la otra persona —un sello del
 * SERVIDOR (`entradoEn`)— de la hora a la que YO monté la conexión —un
 * `Date.now()` del NAVEGADOR—. Son **dos relojes distintos**: si el del servidor
 * va por delante del mío —clientes con la hora mal puesta, que los hay a
 * montones— la resta da que «entró después de que la monté» aunque sea mentira,
 * y la conexión se rehace en CADA vuelta del reloj. Eso es *churn*: el recuadro
 * se queda en «Conectando…» para siempre y el audio entra y sale, sin un solo
 * error que mirar.
 *
 * La comparación correcta no cruza relojes: la conexión es de otra sesión
 * **solo si el `desde` de ahora es distinto del que tenía cuando la adopté**.
 * Los dos vienen del mismo reloj —el del servidor—, así que la resta no existe y
 * no hay skew que valga. Un `desde` que falta no decide nada: se ve de menos
 * —no se rehace de más—, que es el lado seguro.
 */
export function laConexionEsDeOtraSesion(input: {
    desdeAhora: string | null | undefined;
    desdeAlAdoptar: string | null | undefined;
}): boolean {
    const { desdeAhora, desdeAlAdoptar } = input;
    if (!desdeAhora || !desdeAlAdoptar) return false;
    return desdeAhora !== desdeAlAdoptar;
}

// ── Cuánto se insiste ───────────────────────────────────────────────────────

/**
 * Cuánto se intenta volver antes de rendirse.
 *
 * Un minuto, y el número tiene motivo: el barrido del servidor saca a los 21 s,
 * así que un minuto deja sitio para **dos** intentos completos de reanudar
 * después de que te hayan sacado, más el propio corte. Menos que eso y un corte
 * de móvil que dura medio minuto —lo normal al cambiar de antena— se rendiría
 * justo antes de poder volver.
 *
 * Y tiene que haber un final: una pestaña que reintenta para siempre es una
 * pestaña con la cámara encendida mandando a nadie, y quien la dejó abierta no
 * se entera. Al rendirse **se dice**, que es la otra mitad.
 */
export const TOPE_PARA_RECONECTAR_MS = 60_000;

export function hayQueRendirse(desdeMs: number): boolean {
    return desdeMs >= TOPE_PARA_RECONECTAR_MS;
}

/** Lo que se lee en la tarjeta mientras se intenta. */
export function comoSeLeeLaReconexion(desdeMs: number): string {
    const quedan = Math.max(0, Math.ceil((TOPE_PARA_RECONECTAR_MS - desdeMs) / 1000));
    if (quedan <= 0) return "No se pudo volver a la reunión.";
    return `Reconectando… (${quedan}s)`;
}

/**
 * El aviso cuando se agota.
 *
 * Se nombra lo que pasó y lo que se puede hacer. «Se perdió la conexión» a
 * secas deja a alguien mirando una pantalla sin saber si esperar o recargar.
 */
export const CUANDO_NO_SE_PUDO_VOLVER =
    "Se perdió la conexión y no se pudo volver a la reunión. Vuelve a entrar cuando tengas red.";
