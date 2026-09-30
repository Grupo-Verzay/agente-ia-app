/**
 * La NARRACIÓN del vídeo de la guía: se sintetiza cada frase, se coloca en la
 * línea de tiempo en el instante en que su acción ocurre en pantalla, y se
 * pega al vídeo como pista de audio.
 *
 * # La voz
 *
 * Por defecto, **Cedar de OpenAI** (`scripts/voz-cedar.mjs`): la misma voz del
 * asistente de «Llamar con IA», y la estándar de toda guía nueva. Las frases
 * salen de su caché; si falta alguna se dice, nunca se cae a otra voz.
 *
 * La voz de antes —`espeak-ng` con MBROLA `mb-es3`, sintetizada en la máquina—
 * se conserva solo si se pide a propósito (`VOZ_GUIA=mb-es3` o `es-419`). Con
 * ella, lo que no es español se escribe como suena (`comoSeDice`); Cedar lo
 * lee bien tal cual, y sus instrucciones le dicen cómo.
 *
 * # El ritmo
 *
 * La misma voz habla fluido en una llamada y sonaba pausada y cortada aquí.
 * Eran dos cosas, y se arreglan las dos:
 *   1. **Dentro de cada frase**: las instrucciones pedían «ritmo pausado de
 *      tutorial» y el modelo metía medio segundo de silencio en cada coma. Las
 *      instrucciones piden ahora el ritmo de una llamada (`voz-cedar.mjs`), y
 *      como el modelo no siempre obedece, `acortarLasPausas` deja cualquier
 *      pausa interior en `RITMO.pausaMaximaMs` y quita el silencio de relleno
 *      de los bordes. No toca la voz: solo quita silencio.
 *   2. **Entre frases**: el guion esperaba a que acabara cada frase, respiraba,
 *      hacía la acción y solo entonces empezaba la siguiente —huecos de hasta
 *      dos segundos y medio—. Ahora las acciones ocurren MIENTRAS se habla,
 *      en la palabra que las nombra (`alDecir` en capturar-guia-leads.mjs).
 *
 * # La sincronía
 *
 * El vídeo lo graba Playwright desde que se abre la página. El guion anota en
 * qué milisegundo empieza cada frase (`Date.now()` menos el arranque) y NO
 * sigue con la acción siguiente hasta que la frase ha terminado de sonar: así
 * lo que se oye y lo que se ve no se separan aunque una acción tarde más de la
 * cuenta.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { VOZ_CEDAR, wavDeLaCache } from "./voz-cedar.mjs";

const VELOCIDAD = Number(process.env.VELOCIDAD_GUIA ?? 148);
let VOZ = process.env.VOZ_GUIA ?? VOZ_CEDAR.voz;

/** Si la narración va con Cedar (lo normal) o con la voz local de antes. */
export const usaCedar = () => VOZ === VOZ_CEDAR.voz;

/** Lee un WAV PCM de 16 bits: recorre los trozos hasta `fmt ` y `data`. */
export function leerWav(buf) {
    if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("no es un WAV");
    let i = 12;
    let fmt = null;
    let datos = null;
    while (i + 8 <= buf.length) {
        const id = buf.toString("ascii", i, i + 4);
        let largo = buf.readUInt32LE(i + 4);
        const cuerpo = i + 8;
        // espeak escribe 0x7fffffff cuando no sabe el largo al empezar: manda lo que hay.
        if (cuerpo + largo > buf.length) largo = buf.length - cuerpo;
        if (id === "fmt ") {
            fmt = { canales: buf.readUInt16LE(cuerpo + 2), frecuencia: buf.readUInt32LE(cuerpo + 4), bits: buf.readUInt16LE(cuerpo + 14) };
        } else if (id === "data") {
            datos = buf.subarray(cuerpo, cuerpo + largo);
        }
        i = cuerpo + largo + (largo % 2);
    }
    if (!fmt || !datos) throw new Error("WAV sin fmt o sin data");
    if (fmt.bits !== 16 || fmt.canales !== 1) throw new Error(`WAV no soportado: ${fmt.canales} canales, ${fmt.bits} bits`);
    return { ...fmt, datos, ms: Math.round((datos.length / 2 / fmt.frecuencia) * 1000) };
}

export function escribirWav(muestras, frecuencia) {
    const cab = Buffer.alloc(44);
    cab.write("RIFF", 0);
    cab.writeUInt32LE(36 + muestras.length, 4);
    cab.write("WAVE", 8);
    cab.write("fmt ", 12);
    cab.writeUInt32LE(16, 16);
    cab.writeUInt16LE(1, 20);
    cab.writeUInt16LE(1, 22);
    cab.writeUInt32LE(frecuencia, 24);
    cab.writeUInt32LE(frecuencia * 2, 28);
    cab.writeUInt16LE(2, 32);
    cab.writeUInt16LE(16, 34);
    cab.write("data", 36);
    cab.writeUInt32LE(muestras.length, 40);
    return Buffer.concat([cab, muestras]);
}

/**
 * La tabla con la que espeak-ng traduce a los fonemas de `es3` está
 * DESCUADRADA en esta versión: le pide a MBROLA fonemas que `es3` no tiene
 * (`h` por la «r» suave, `L`, `R2`, `tS`) y MBROLA los rellena con SILENCIO.
 * Sin arreglarla, la narración sale llena de cortes en mitad de las palabras
 * —«núme_o», «esc_ito»— sin un solo error.
 *
 * Así que la transcripción se pide aparte (`--pho`), se corrige con los
 * fonemas que `es3` sí tiene (a e i o u b d f g j k l m n p r s t H N R Y) y
 * se le da a MBROLA SIN permiso para rellenar: un fonema que falte revienta en
 * vez de sonar como un hueco.
 */
const CAMBIOS = {
    h: "r", // la «r» suave
    L: "Y", // la «ll»
    R2: "R", // la «rr»
    tS: "Y", // «ch»: es3 no la tiene; la «ll» es lo más cercano
    z: "s", // seseo: se narra como en Latinoamérica
};

/** Los fonemas que tiene `es3`. */
export const FONEMAS_ES3 = ["_", "a", "e", "i", "o", "u", "b", "d", "f", "g", "j", "k", "l", "m", "n", "p", "r", "s", "t", "H", "N", "R", "Y"];
const VOCAL = new Set(["a", "e", "i", "o", "u"]);

/**
 * Corrige una transcripción `.pho` de espeak para la base `es3`. Pura:
 * `hayDifono(x, y)` dice qué parejas tiene la base.
 *
 * Tres arreglos, en este orden:
 *   1. los fonemas cambiados (`CAMBIOS`);
 *   2. la «u» de «cua», «gua»: espeak la manda como `b` («k b a l k j e r»);
 *   3. la semivocal `j` pegada a una consonante pasa a «i»;
 *   4. dos iguales seguidos se funden, y entre dos consonantes que es3 no
 *      sabe unir («t p» de «otra vez para») se mete una pausa de 12 ms, que
 *      es lo que dura un cambio de palabra y no se oye como un corte.
 */
export function arreglarPho(pho, hayDifono = () => true) {
    const fonemas = [];
    for (const linea of pho.split("\n")) {
        const partes = linea.trim().split(/\s+/);
        if (!partes[0] || partes[0].startsWith(";")) continue;
        const [fonema, duracion, ...tono] = partes;
        fonemas.push({ f: CAMBIOS[fonema] ?? fonema, d: Number(duracion), tono });
    }
    for (let i = 1; i + 1 < fonemas.length; i += 1) {
        if (fonemas[i].f === "b" && (fonemas[i - 1].f === "k" || fonemas[i - 1].f === "g") && VOCAL.has(fonemas[i + 1].f)) fonemas[i].f = "u";
    }
    const salida = [];
    for (const actual of fonemas) {
        const anterior = salida[salida.length - 1];
        if (anterior && anterior.f === actual.f) {
            anterior.d += actual.d;
            continue;
        }
        // La «i» que se apoya en una consonante («cualquier», «artificial»):
        // espeak la manda como semivocal `j`, y es3 solo la une a vocales.
        if (anterior && actual.f === "j" && !hayDifono(anterior.f, "j") && hayDifono(anterior.f, "i")) actual.f = "i";
        if (anterior && !hayDifono(anterior.f, actual.f) && hayDifono(anterior.f, "_") && hayDifono("_", actual.f)) {
            salida.push({ f: "_", d: 12, tono: [] });
        }
        salida.push({ ...actual });
    }
    return salida.map(({ f, d, tono }) => [f, d, ...tono].join(" ")).join("\n") + "\n";
}

const BASE_ES3 = process.env.MBROLA_ES3 ?? "/usr/share/mbrola/es3/es3";
let difonos = null;

/** Qué parejas tiene es3: se pregunta a MBROLA una vez (576 parejas, ~2 s). */
function hayDifonoEnEs3(x, y) {
    if (!difonos) {
        difonos = new Set();
        const tmp = path.join(os.tmpdir(), `difono-${process.pid}`);
        for (const a of FONEMAS_ES3) {
            for (const b of FONEMAS_ES3) {
                writeFileSync(`${tmp}.pho`, `${a} 60\n${b} 60\n`);
                if (spawnSync("mbrola", [BASE_ES3, `${tmp}.pho`, `${tmp}.wav`]).status === 0) difonos.add(`${a}-${b}`);
            }
        }
    }
    return difonos.has(`${x}-${y}`);
}

/**
 * El ritmo de la narración: cuánto silencio se deja dentro de una frase y en
 * sus bordes. Queda escrito en `voz-de-la-guia/leads.json` con el vídeo, y el
 * banco lo compara con este: un vídeo publicado con otro ritmo se regenera.
 */
export const RITMO = Object.freeze({
    /** Una pausa DENTRO de una frase no pasa de aquí: lo que sobra se quita. */
    pausaMaximaMs: 280,
    /** El silencio que se deja antes de la primera palabra y tras la última. */
    bordeInicialMs: 30,
    bordeFinalMs: 60,
    /**
     * Por debajo de este nivel es silencio: RMS de una ventana, en fracción del
     * máximo. 0,01 son −40 dBFS, el mismo umbral con el que el banco mide las
     * pausas con `silencedetect`.
     */
    umbral: 0.01,
    ventanaMs: 10,
    /** El fundido de cada corte, para que no chasquee. */
    fundidoMs: 6,
});

/** Qué ventanas de `ventanaMs` suenan (por encima del umbral). */
function lasVentanasQueSuenan(audio, ritmo) {
    const n = Math.floor(audio.datos.length / 2);
    const porVentana = Math.max(1, Math.round((audio.frecuencia * ritmo.ventanaMs) / 1000));
    const limite = ritmo.umbral * 32768;
    const suena = [];
    for (let a = 0; a < n; a += porVentana) {
        const b = Math.min(n, a + porVentana);
        let suma = 0;
        for (let i = a; i < b; i += 1) {
            const x = audio.datos.readInt16LE(i * 2);
            suma += x * x;
        }
        suena.push(Math.sqrt(suma / (b - a)) >= limite);
    }
    return { n, porVentana, suena };
}

/**
 * Las pausas de una frase, en ms: las de DENTRO (entre la primera palabra y la
 * última) y el silencio de los bordes. Pura: la usa el banco para medir.
 */
export function lasPausas(audio, ritmo = RITMO) {
    const { porVentana, suena } = lasVentanasQueSuenan(audio, ritmo);
    const ms = (ventanas) => Math.round((ventanas * porVentana * 1000) / audio.frecuencia);
    const primera = suena.indexOf(true);
    if (primera < 0) return { interiores: [], inicio: ms(suena.length), fin: 0, vozMs: 0 };
    const ultima = suena.lastIndexOf(true);
    const interiores = [];
    let silencio = 0;
    for (let v = primera; v <= ultima; v += 1) {
        if (suena[v]) {
            if (silencio) interiores.push(ms(silencio));
            silencio = 0;
        } else silencio += 1;
    }
    return { interiores, inicio: ms(primera), fin: ms(suena.length - 1 - ultima), vozMs: ms(ultima - primera + 1) };
}

/**
 * Deja cada pausa interior en `pausaMaximaMs` como mucho —se conserva la mitad
 * de su principio y la mitad de su final, así no se come la cola de una
 * palabra ni el arranque de la siguiente— y los bordes en `bordeInicialMs` y
 * `bordeFinalMs`. Solo quita silencio: la voz sale entera, muestra a muestra.
 * Pura.
 */
export function acortarLasPausas(audio, ritmo = RITMO) {
    const { n, porVentana, suena } = lasVentanasQueSuenan(audio, ritmo);
    const primera = suena.indexOf(true);
    if (primera < 0) return audio; // todo silencio: no hay voz que acercar
    const ultima = suena.lastIndexOf(true);
    const muestras = (ms) => Math.round((ms * audio.frecuencia) / 1000);
    const mitad = Math.floor(muestras(ritmo.pausaMaximaMs) / 2);
    const tramos = [];
    let desde = Math.max(0, primera * porVentana - muestras(ritmo.bordeInicialMs));
    for (let v = primera; v <= ultima; ) {
        if (suena[v]) {
            v += 1;
            continue;
        }
        let w = v;
        while (!suena[w]) w += 1; // hay voz después: `ultima` suena
        if ((w - v) * porVentana > 2 * mitad) {
            tramos.push([desde, v * porVentana + mitad]);
            desde = w * porVentana - mitad;
        }
        v = w;
    }
    tramos.push([desde, Math.min(n, (ultima + 1) * porVentana + muestras(ritmo.bordeFinalMs))]);

    const total = tramos.reduce((s, [a, b]) => s + (b - a), 0);
    const salida = Buffer.alloc(total * 2);
    const fundido = Math.max(1, muestras(ritmo.fundidoMs));
    let o = 0;
    tramos.forEach(([a, b], t) => {
        for (let i = a; i < b; i += 1) {
            let x = audio.datos.readInt16LE(i * 2);
            // Fundido en los cortes (no en el principio ni en el final de la frase).
            if (t > 0 && i - a < fundido) x = Math.round((x * (i - a)) / fundido);
            if (t < tramos.length - 1 && b - 1 - i < fundido) x = Math.round((x * (b - 1 - i)) / fundido);
            salida.writeInt16LE(x, o * 2);
            o += 1;
        }
    });
    return { ...audio, datos: salida, ms: Math.round((total / audio.frecuencia) * 1000) };
}

/** Sintetiza una frase y devuelve su audio ya leído, con el ritmo de la narración. */
export function sintetizar(texto, archivo) {
    if (usaCedar()) {
        const audio = acortarLasPausas(leerWav(wavDeLaCache(texto)));
        writeFileSync(archivo, escribirWav(audio.datos, audio.frecuencia));
        return audio;
    }
    if (VOZ === "mb-es3" && !existsSync(BASE_ES3)) {
        console.warn(`[guia] falta la voz MBROLA es3 (apt-get install mbrola mbrola-es3); se narra con es-419`);
        VOZ = "es-419";
    }
    if (VOZ !== "mb-es3") {
        execFileSync("espeak-ng", ["-v", VOZ, "-s", String(VELOCIDAD), "-w", archivo, texto], { stdio: ["ignore", "ignore", "ignore"] });
        return leerWav(readFileSync(archivo));
    }
    const pho = execFileSync("espeak-ng", ["-v", "mb-es3", "-s", String(VELOCIDAD), "--pho", "-q", texto], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
    const rutaPho = archivo.replace(/\.wav$/, "") + ".pho";
    writeFileSync(rutaPho, arreglarPho(pho, hayDifonoEnEs3));
    const r = spawnSync("mbrola", ["-v", "0.7", BASE_ES3, rutaPho, archivo], { encoding: "utf8" });
    const avisos = (r.stderr || "").split("\n").filter((l) => l.trim() && !l.startsWith("Saturation"));
    if (r.status !== 0 || avisos.length) throw new Error(`MBROLA no pudo decir «${texto}»: ${avisos.join(" | ")}`);
    return leerWav(readFileSync(archivo));
}

/**
 * Coloca cada frase en su instante y devuelve la pista entera. Si dos frases
 * se pisaran, la segunda se corre detrás de la primera: nunca suenan dos a la
 * vez.
 */
export function montarLaPista(tramos, totalMs) {
    if (!tramos.length) throw new Error("no hay frases que montar");
    const frecuencia = tramos[0].audio.frecuencia;
    const muestrasPorMs = frecuencia / 1000;
    const total = Math.ceil(totalMs * muestrasPorMs);
    const pista = Buffer.alloc(total * 2);
    let libreDesde = 0;
    const colocados = [];
    for (const t of tramos) {
        if (t.audio.frecuencia !== frecuencia) throw new Error("las frases no tienen la misma frecuencia");
        const inicio = Math.max(Math.round(t.inicioMs * muestrasPorMs), libreDesde);
        const n = Math.min(t.audio.datos.length / 2, total - inicio);
        if (n <= 0) throw new Error(`la frase «${t.texto}» cae fuera del vídeo`);
        t.audio.datos.copy(pista, inicio * 2, 0, n * 2);
        libreDesde = inicio + n;
        colocados.push({ texto: t.texto, inicioMs: Math.round(inicio / muestrasPorMs), finMs: Math.round(libreDesde / muestrasPorMs) });
    }
    return { wav: escribirWav(pista, frecuencia), colocados };
}

/**
 * Dónde cae un instante de la grabación en el vídeo ya sin los CORTES
 * (`sinGrabarLaEspera` del taller): se le resta lo que duran los cortes que
 * acabaron antes. Un instante DENTRO de un corte cae en su principio, que es
 * donde se empalma lo de antes con lo de después.
 *
 * Los cortes van en ms desde el principio de la grabación, igual que los
 * tramos de voz; se ordenan y no se solapan (los hace uno detrás de otro).
 */
export function quitarLosCortes(ms, cortes = []) {
    let quitado = 0;
    for (const c of [...cortes].sort((a, b) => a.desdeMs - b.desdeMs)) {
        if (ms <= c.desdeMs) break;
        if (ms < c.hastaMs) return c.desdeMs - quitado;
        quitado += c.hastaMs - c.desdeMs;
    }
    return ms - quitado;
}

/**
 * Los tramos de voz con los cortes quitados. Una frase que SONARA durante un
 * corte perdería el trozo que se quita de la imagen y la voz se adelantaría a
 * lo que se ve —justo el fallo que el corte viene a evitar—, así que se cae.
 */
export function tramosSinLosCortes(tramos, cortes = []) {
    for (const t of tramos) {
        const fin = t.inicioMs + t.audio.ms;
        const pisa = cortes.find((c) => t.inicioMs < c.hastaMs && fin > c.desdeMs);
        if (pisa) throw new Error(`la frase «${t.texto}» suena durante un corte (${pisa.desdeMs}-${pisa.hastaMs} ms)`);
    }
    return tramos.map((t) => ({ ...t, inicioMs: quitarLosCortes(t.inicioMs, cortes) }));
}

/** Lo que duran todos los cortes juntos. */
export const loQueSeCorta = (cortes = []) => cortes.reduce((s, c) => s + (c.hastaMs - c.desdeMs), 0);

/**
 * El filtro de ffmpeg que quita de la IMAGEN lo grabado antes de `desdeMs` y
 * lo de dentro de cada corte, y vuelve a numerar los fotogramas seguidos: la
 * grabadora escribe a un ritmo fijo (`FPS`), así que el fotograma n cae en
 * n/FPS y la imagen queda en el mismo reloj que la pista ya sin cortes.
 */
export function filtroSinLosCortes(desdeMs, cortes, fps = 25) {
    const s = (ms) => (ms / 1000).toFixed(3);
    const fuera = cortes.map((c) => `between(t\\,${s(c.desdeMs)}\\,${s(c.hastaMs)})`);
    const quedan = [`gte(t\\,${s(desdeMs)})`, ...fuera.map((f) => `not(${f})`)].join("*");
    return `select='${quedan}',setpts=N/${fps}/TB`;
}

/**
 * Pega la pista al vídeo, con el audio en Opus. Sin `desdeMs` el vídeo se
 * copia tal cual. Con `desdeMs` se recorta lo grabado antes —la página
 * cargando, segundos de pantalla quieta y sin voz— cortando el vídeo Y la
 * pista en el mismo instante, así que la sincronía no se mueve; como un corte
 * exacto no cae en un fotograma clave, el vídeo se vuelve a codificar (VP8,
 * el mismo códec que graba Playwright).
 *
 * Con `cortes` (ver `sinGrabarLaEspera` del taller) la imagen pierde además
 * lo grabado dentro de cada uno. La pista ya viene montada SIN ellos
 * (`tramosSinLosCortes`), así que al audio solo se le recorta `desdeMs`:
 * los cortes van siempre después, y ese tramo es el mismo en los dos relojes.
 */
export function mezclar(video, pista, salida, { desdeMs = 0, cortes = [] } = {}) {
    if (cortes.some((c) => c.desdeMs < desdeMs)) throw new Error("un corte cae antes de donde empieza el vídeo");
    const conCortes = cortes.length > 0;
    const desde = desdeMs > 0 ? ["-ss", (desdeMs / 1000).toFixed(3)] : [];
    const recodificar = ["-c:v", "libvpx", "-b:v", "2M", "-crf", "8", "-qmin", "0", "-qmax", "40", "-deadline", "good", "-cpu-used", "1", "-auto-alt-ref", "0"];
    // Con cortes el recorte del principio va en el mismo filtro que los quita:
    // así los instantes del filtro son los de la grabación, los mismos en los
    // que se apuntaron los cortes.
    const entradaDelVideo = conCortes ? ["-i", video] : [...desde, "-i", video];
    const imagen = conCortes
        ? ["-vf", filtroSinLosCortes(desdeMs, cortes), ...recodificar]
        : desdeMs > 0
          ? recodificar
          : ["-c:v", "copy"];
    execFileSync(
        "ffmpeg",
        // `-shortest`: el vídeo acaba con la narración. La grabación sigue
        // unos segundos más mientras se cierra el navegador, y eso era una
        // cola muda de 4-5 s al final del vídeo publicado.
        ["-y", "-loglevel", "error", ...entradaDelVideo, ...desde, "-i", pista, "-map", "0:v:0", "-map", "1:a:0", ...imagen,
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "libopus", "-b:a", "64k", "-ar", "48000", "-shortest", salida],
        { stdio: "inherit" },
    );
}

export function guardarWav(ruta, wav) {
    writeFileSync(ruta, wav);
}
