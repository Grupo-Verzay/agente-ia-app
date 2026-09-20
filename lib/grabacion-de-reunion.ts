/**
 * Grabar una reunión, y transcribirla después.
 *
 * Puro, como el resto de lo que decide algo en esta suite: de aquí tiran la
 * sala —que pinta el botón y el aviso—, las acciones de servidor, la ruta que
 * recibe las partes y el banco.
 *
 * # Por qué se graba en el NAVEGADOR y no en el servidor
 *
 * Porque no hay dónde. Esto es una malla directa sin servidor de video (ver
 * `lib/sala-de-video.ts`): el servidor nunca ve un solo fotograma, solo pasa
 * ofertas SDP. Así que graba **la pestaña de quien pulsa**, mezclando el audio
 * de todos y —si se pidió video— dibujando la misma rejilla en un lienzo.
 *
 * De ahí sale la consecuencia que hay que conocer antes de tocar nada: **si esa
 * pestaña se cierra, la grabación se acaba**. Lo que se hubiera subido se
 * conserva; lo que no, no existe. Por eso el aviso de «grabando» caduca solo
 * (ver `SIGUE_GRABANDO_MS`): una marca que no caducara dejaría a la sala
 * diciendo que se graba cuando ya no graba nadie.
 *
 * # El audio se graba SIEMPRE, aunque se pida video
 *
 * Es la decisión de la que cuelga que la transcripción sea barata y posible:
 *
 * - Whisper no admite un archivo de más de **25 MB**, y una hora de video son
 *   del orden de **1 GB**. Mandarle el video es imposible, y sacarle el audio
 *   en el servidor pediría `ffmpeg`, que este contenedor no tiene.
 * - Una hora de audio solo, al bitrate de aquí abajo, son **~14 MB**: cabe.
 *
 * Así que una grabación en video produce **dos** ficheros —el video y su
 * audio—, y el segundo es el que se transcribe. Cuesta un 1,5 % más de
 * almacenamiento y es lo que hace que «transcribir» sea un botón y no un
 * proyecto.
 */

// ── Lo que se graba ─────────────────────────────────────────────────────────

export type ModoDeGrabacion = "audio" | "video";

const MODOS: readonly ModoDeGrabacion[] = ["audio", "video"];

export function esModoDeGrabacion(v: unknown): v is ModoDeGrabacion {
    return typeof v === "string" && (MODOS as readonly string[]).includes(v);
}

/**
 * El bitrate del audio, y por qué es este número.
 *
 * 32 kbps de Opus mono es habla limpia —es el orden de una nota de voz de
 * WhatsApp— y, sobre todo, es lo que hace que **una hora quepa en los 25 MB de
 * OpenAI**: 32 kbps × 3.600 s ÷ 8 = 14,4 MB. A 64 kbps una hora son 29 MB y la
 * transcripción de una reunión normal dejaría de caber, que es tanto como no
 * tenerla.
 */
export const AUDIO_BPS = 32_000;

/**
 * El bitrate del video.
 *
 * 1,5 Mbps sobre una rejilla de 1280×720 a 12 fps: una hora son ~675 MB, por
 * debajo del giga que se presupuestó. No se sube más porque lo que se graba es
 * una rejilla de caras hablando, no una película, y cada megabit de más lo paga
 * el cupo de la cuenta y la CPU de quien graba —que además está codificando su
 * propia cámara para la malla—.
 */
export const VIDEO_BPS = 1_500_000;
export const ANCHO_DEL_LIENZO = 1280;
export const ALTO_DEL_LIENZO = 720;
export const FPS_DEL_LIENZO = 12;

/** Lo que ocupa una hora de cada cosa, para poder avisar antes de empezar. */
export function bytesPorHora(modo: ModoDeGrabacion): number {
    const audio = (AUDIO_BPS / 8) * 3600;
    return modo === "audio" ? audio : audio + (VIDEO_BPS / 8) * 3600;
}

// ── Las partes ──────────────────────────────────────────────────────────────

/**
 * El tamaño de cada parte que se sube.
 *
 * **Ocho MiB, y el suelo no es negociable**: las partes se juntan en el
 * servidor con `composeObject`, que por debajo es un multipart de S3, y ahí
 * **toda parte menos la última tiene que pasar de 5 MiB**. Con partes más
 * pequeñas la unión falla —y falla al final, con la grabación ya hecha, que es
 * el peor momento posible—.
 *
 * Por arriba manda la memoria: la parte entera vive en el navegador y otra vez
 * en el proceso que la recibe, así que subirla a 64 MB sería ahogar las dos
 * puntas para ahorrar unas cuantas peticiones.
 */
export const TAMANO_DE_PARTE = 8 * 1024 * 1024;
export const MINIMO_DE_PARTE = 5 * 1024 * 1024;

/** El tope de partes de un multipart de S3. Con 8 MiB son 80 GB, de sobra. */
export const TOPE_DE_PARTES = 10_000;

/**
 * Si un trozo acumulado ya se puede mandar como parte.
 *
 * `esLaUltima` es lo que deja soltar lo que quede al terminar, por poco que
 * sea: la última parte sí puede bajar del mínimo.
 */
export function sePuedeMandarLaParte(input: {
    bytes: number;
    esLaUltima: boolean;
}): boolean {
    if (input.bytes <= 0) return false;
    return input.esLaUltima || input.bytes >= TAMANO_DE_PARTE;
}

/**
 * La llave de una parte dentro del bucket.
 *
 * Con el número **rellenado a cinco cifras** a propósito: las partes se listan
 * para juntarlas, y en un listado de S3 el orden es alfabético — sin relleno,
 * la parte 10 iría antes que la 2 y el fichero saldría con los trozos
 * desordenados. Un webm desordenado no da error: se abre y se ve mal.
 */
export function llaveDeLaParte(input: {
    cuentaId: string;
    grabacionId: string;
    cual: "audio" | "video";
    numero: number;
}): string {
    const n = String(Math.max(1, Math.floor(input.numero))).padStart(5, "0");
    return `${input.cuentaId}/reuniones/${input.grabacionId}/partes-${input.cual}/${n}.webm`;
}

/** Dónde queda el fichero ya junto. */
export function llaveDeLaGrabacion(input: {
    cuentaId: string;
    grabacionId: string;
    cual: "audio" | "video";
}): string {
    return `${input.cuentaId}/reuniones/${input.grabacionId}/${input.cual}.webm`;
}

// ── El cupo de la cuenta ────────────────────────────────────────────────────

/**
 * Lo que cabe por cuenta.
 *
 * Veinte gibibytes son unas **veinte horas de video** o **mil cuatrocientas de
 * audio**. Es un tope de la CUENTA y no de la reunión: lo que se acaba llenando
 * es el bucket, y el bucket no sabe de reuniones.
 */
export const TOPE_POR_CUENTA = 20 * 1024 * 1024 * 1024;

/** A partir de qué parte del cupo se avisa. */
export const CUANDO_AVISAR = 0.8;

export type ComoVaElCupo = {
    usados: number;
    tope: number;
    /** De 0 a 1. Nunca pasa de 1, aunque lo usado sí pueda pasarse del tope. */
    parte: number;
    /** Si ya no cabe una grabación nueva. */
    lleno: boolean;
    /** Si conviene decirlo aunque todavía quepa. */
    cerca: boolean;
};

export function comoVaElCupo(usados: number): ComoVaElCupo {
    const limpios = Number.isFinite(usados) && usados > 0 ? Math.floor(usados) : 0;
    const parte = Math.min(1, limpios / TOPE_POR_CUENTA);
    return {
        usados: limpios,
        tope: TOPE_POR_CUENTA,
        parte,
        lleno: limpios >= TOPE_POR_CUENTA,
        cerca: parte >= CUANDO_AVISAR,
    };
}

/** «12,4 GB», «840 MB». Para decir el cupo sin que nadie cuente ceros. */
export function comoSeLeenLosBytes(bytes: number): string {
    const n = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
    if (n < 1024) return `${n} B`;
    const unidades = ["KB", "MB", "GB", "TB"];
    let valor = n / 1024;
    let i = 0;
    while (valor >= 1024 && i < unidades.length - 1) {
        valor /= 1024;
        i += 1;
    }
    const redondeado = valor >= 100 ? Math.round(valor) : Math.round(valor * 10) / 10;
    return `${String(redondeado).replace(".", ",")} ${unidades[i]}`;
}

// ── Cuánto se guarda ────────────────────────────────────────────────────────

/**
 * Cuánto vive una grabación antes de borrarse sola.
 *
 * Ciento ochenta días. Y se borra **de verdad**, fichero incluido: una fila sin
 * su fichero es una ficha que ofrece un reproductor que no suena, y un fichero
 * sin su fila es un giga que nadie sabe de dónde salió.
 *
 * La transcripción y el resumen **se quedan** cuando el audio se va: son texto,
 * ocupan nada, y son justo lo que alguien va a buscar de una reunión de hace
 * seis meses. Es la misma idea que copiar el nombre del autor dentro de un
 * mensaje: lo barato que sobrevive a lo caro.
 */
export const DIAS_DE_GRABACION = 180;

/** Avisar en la ficha cuando le queden pocos días. */
export const AVISAR_A_LOS_DIAS = 165;

export function diasQueLeQuedan(creadaEn: Date, ahora: Date = new Date()): number {
    const pasados = Math.floor((ahora.getTime() - creadaEn.getTime()) / 86_400_000);
    return Math.max(0, DIAS_DE_GRABACION - pasados);
}

// ── El aviso de que se está grabando ────────────────────────────────────────

/**
 * Cuánto vale la marca de «se está grabando» sin refrescarse.
 *
 * La graba una pestaña, y una pestaña se cierra sin avisar. Sin caducidad, la
 * sala diría «grabando» para siempre después de que a quien grababa se le
 * cerrara el portátil — y un aviso que miente sobre algo así es peor que no
 * tenerlo.
 *
 * Es la misma forma que la mano levantada y la petición de silencio: una marca
 * de tiempo que el reloj de quien graba refresca, no un booleano. El margen es
 * el mismo que el de la presencia, por el mismo motivo: tres vueltas perdidas
 * no pueden apagar el aviso.
 */
export const SIGUE_GRABANDO_MS = 21_000;

export function seSigueGrabando(
    vistoEn: Date | string | null | undefined,
    ahora: number = Date.now(),
): boolean {
    if (!vistoEn) return false;
    const marca = vistoEn instanceof Date ? vistoEn.getTime() : Date.parse(vistoEn);
    if (!Number.isFinite(marca)) return false;
    return ahora - marca <= SIGUE_GRABANDO_MS;
}

/**
 * El tope de una grabación suelta.
 *
 * Tres horas. No protege el cupo —de eso se encarga `comoVaElCupo`, que mira lo
 * que de verdad hay en el bucket— sino de la pestaña olvidada: una reunión que
 * acabó hace horas con el botón todavía pulsado son gigas de una sala vacía.
 * Al llegar se **para y se guarda lo que haya**, que es lo contrario de tirarlo.
 */
export const TOPE_DE_UNA_GRABACION_MS = 3 * 60 * 60 * 1000;

// ── Transcribir ─────────────────────────────────────────────────────────────

/**
 * Lo más grande que acepta OpenAI en un archivo de audio.
 *
 * Es un límite **de ellos**, no una decisión nuestra, y por eso se comprueba
 * sobre los BYTES del fichero y no sobre los minutos: los minutos son una
 * estimación y los bytes son el dato que va a viajar. Con un margen por debajo,
 * porque la petición lleva algo más que el audio.
 */
export const TOPE_DE_OPENAI = 24 * 1024 * 1024;

export type QueHacerConLaGrabacion =
    | { hacer: "transcribir"; creditos: number; tokens: number }
    | { hacer: "ya_esta" }
    | { hacer: "sin_audio" }
    | { hacer: "demasiado_grande" }
    | { hacer: "sin_creditos"; hacenFalta: number; quedan: number };

/**
 * Qué se puede hacer con una grabación cuando alguien pulsa «Transcribir».
 *
 * La tarifa **no se vuelve a escribir aquí**: es `costoDeLaNota` de
 * `lib/transcripcion-de-voz.ts`, los mismos seis créditos por minuto
 * prorrateados que cobran las notas de voz de Chats y las del chat del equipo.
 * Quien llama se la pasa ya calculada, que es lo que impide que esta pantalla
 * acabe cobrando otro precio sin que nadie se entere.
 *
 * El orden de las preguntas importa: **lo que ya está hecho se contesta
 * primero**, antes de mirar créditos o tamaños — si no, una grabación ya
 * transcrita diría «no hay créditos» en vez de enseñar su texto.
 */
export function queHacerConLaGrabacion(input: {
    yaTranscrita: boolean;
    audioBytes: number | null;
    costo: { creditos: number; tokens: number };
    /** `null` = ilimitados: la cuenta paga su propia IA. */
    creditosDisponibles: number | null;
}): QueHacerConLaGrabacion {
    if (input.yaTranscrita) return { hacer: "ya_esta" };
    if (!input.audioBytes || input.audioBytes <= 0) return { hacer: "sin_audio" };
    if (input.audioBytes > TOPE_DE_OPENAI) return { hacer: "demasiado_grande" };
    if (input.creditosDisponibles !== null && input.creditosDisponibles < input.costo.creditos) {
        return {
            hacer: "sin_creditos",
            hacenFalta: input.costo.creditos,
            quedan: input.creditosDisponibles,
        };
    }
    return { hacer: "transcribir", creditos: input.costo.creditos, tokens: input.costo.tokens };
}

/** Lo que se le dice a quien pulsa y no se puede. */
export function porQueNoSeTranscribe(que: QueHacerConLaGrabacion): string | null {
    switch (que.hacer) {
        case "transcribir":
        case "ya_esta":
            return null;
        case "sin_audio":
            return "Esta grabación no tiene audio que transcribir.";
        case "demasiado_grande":
            return "La grabación es demasiado larga para transcribirla de una vez.";
        case "sin_creditos":
            return `No hay créditos suficientes: hacen falta ${que.hacenFalta} y quedan ${que.quedan}.`;
    }
}

// ── El resumen ──────────────────────────────────────────────────────────────

/**
 * Qué se le pide al modelo, y por qué el resumen no se cobra aparte.
 *
 * La orden dice «seis créditos por minuto prorrateado» y «entrega texto y un
 * resumen». Son **un precio y dos entregas**, no dos precios: el resumen de una
 * reunión de una hora son unos pocos miles de tokens de un modelo de texto,
 * calderilla al lado de lo que cuesta transcribirla. Cobrarlo aparte
 * obligaría a enseñar dos cifras en el botón para una sola pulsación.
 *
 * Y el prompt pide **puntos tratados**, no un párrafo bonito: de una reunión
 * se vuelve a buscar «qué se dijo de X», y una lista se recorre con los ojos.
 * Se le dice además que no invente —un resumen que añade acuerdos que nadie
 * tomó es peor que no tener resumen— y que conteste en el idioma de la
 * reunión, que no tiene por qué ser el de la plataforma.
 */
export const COMO_SE_PIDE_EL_RESUMEN = [
    "Eres un asistente que resume reuniones de trabajo.",
    "Te doy la transcripción de una reunión. Devuelve:",
    "1. Una frase con el asunto de la reunión.",
    "2. Una lista con los puntos que se trataron, uno por línea, empezando con «- ».",
    "3. Si los hay, una lista aparte de acuerdos o tareas, con quién se encarga si se dice.",
    "",
    "Reglas:",
    "- No inventes nada que no esté en la transcripción.",
    "- Si algo no se entiende o no se llegó a decidir, dilo en vez de rellenarlo.",
    "- Responde en el mismo idioma en el que está la transcripción.",
    "- Sin preámbulo: empieza directamente por el asunto.",
].join("\n");

/**
 * Lo más largo que se le manda al modelo del resumen.
 *
 * Una hora de conversación son del orden de 60.000 caracteres, que caben de
 * sobra. El tope está para lo que no se espera —una transcripción rota, un
 * bucle— y recorta por el PRINCIPIO de la reunión, no por el final: si hay que
 * dejar algo fuera, lo que se pierde es el saludo y no los acuerdos.
 */
export const TOPE_DEL_RESUMEN = 120_000;

export function loQueSeLeManda(texto: string): string {
    const limpio = (texto ?? "").trim();
    if (limpio.length <= TOPE_DEL_RESUMEN) return limpio;
    return limpio.slice(limpio.length - TOPE_DEL_RESUMEN);
}

// ── Dónde va cada uno en el lienzo ──────────────────────────────────────────

export type Casilla = { x: number; y: number; ancho: number; alto: number };

/**
 * El reparto del lienzo entre los que salen.
 *
 * Puro y aparte del de la pantalla a propósito: `laRejilla` de
 * `lib/sala-de-video.ts` devuelve **clases de Tailwind**, que a un `<canvas>`
 * no le dicen nada. Son dos formas del mismo reparto, y la que se puede probar
 * sin navegador es esta.
 *
 * Con uno, la pantalla entera; con dos, en vertical partido por la mitad; con
 * tres o cuatro, dos por dos. Y con tres, **el tercero abajo ocupando el
 * ancho**: dejarle media fila y media fila en negro se lee como que falta
 * alguien.
 *
 * Por encima de cuatro no hay caso, porque la sala tiene tope de cuatro; si
 * algún día sube, esto reparte en cuadrícula y lo dice el banco.
 */
export function lasCasillasDelLienzo(
    cuantos: number,
    ancho: number = ANCHO_DEL_LIENZO,
    alto: number = ALTO_DEL_LIENZO,
): Casilla[] {
    const n = Math.max(0, Math.floor(cuantos));
    if (n === 0) return [];
    if (n === 1) return [{ x: 0, y: 0, ancho, alto }];
    if (n === 2) {
        const mitad = Math.floor(ancho / 2);
        return [
            { x: 0, y: 0, ancho: mitad, alto },
            { x: mitad, y: 0, ancho: ancho - mitad, alto },
        ];
    }
    if (n === 3) {
        const mitadAncho = Math.floor(ancho / 2);
        const mitadAlto = Math.floor(alto / 2);
        return [
            { x: 0, y: 0, ancho: mitadAncho, alto: mitadAlto },
            { x: mitadAncho, y: 0, ancho: ancho - mitadAncho, alto: mitadAlto },
            { x: 0, y: mitadAlto, ancho, alto: alto - mitadAlto },
        ];
    }
    const columnas = Math.ceil(Math.sqrt(n));
    const filas = Math.ceil(n / columnas);
    const w = Math.floor(ancho / columnas);
    const h = Math.floor(alto / filas);
    return Array.from({ length: n }, (_, i) => ({
        x: (i % columnas) * w,
        y: Math.floor(i / columnas) * h,
        ancho: w,
        alto: h,
    }));
}

/**
 * Cómo entra un video dentro de su casilla sin deformarse.
 *
 * Se recorta por el lado que sobra (`cover`), no se estira: una cara aplastada
 * se nota a la primera y una cara recortada por los lados, no. Devuelve el
 * rectángulo de ORIGEN, que es lo que `drawImage` necesita para recortar.
 */
export function comoEntraElVideo(input: {
    anchoDelVideo: number;
    altoDelVideo: number;
    casilla: Casilla;
}): { sx: number; sy: number; sw: number; sh: number } | null {
    const { anchoDelVideo: vw, altoDelVideo: vh, casilla } = input;
    if (!vw || !vh || !casilla.ancho || !casilla.alto) return null;
    const deseada = casilla.ancho / casilla.alto;
    const suya = vw / vh;
    if (suya > deseada) {
        const sw = Math.round(vh * deseada);
        return { sx: Math.round((vw - sw) / 2), sy: 0, sw, sh: vh };
    }
    const sh = Math.round(vw / deseada);
    return { sx: 0, sy: Math.round((vh - sh) / 2), sw: vw, sh };
}
