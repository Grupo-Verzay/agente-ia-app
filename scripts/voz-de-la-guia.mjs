/**
 * La NARRACIÓN del vídeo de la guía: se sintetiza cada frase, se coloca en la
 * línea de tiempo en el instante en que su acción ocurre en pantalla, y se
 * pega al vídeo como pista de audio.
 *
 * # La voz
 *
 * Se sintetiza en esta máquina, sin ningún servicio de fuera: `espeak-ng` con
 * la voz MBROLA `mb-es3` (española, femenina). Es la única voz en español que
 * se puede instalar sin internet más allá de los repositorios del sistema
 * (`apt-get install espeak-ng mbrola mbrola-es3`). Sin MBROLA cae en la voz de
 * formantes `es-419`, que se entiende pero suena más robótica, y lo dice.
 * `VOZ_GUIA` elige otra. Lo que se lee en voz alta puede escribirse distinto
 * de lo que se ve (`dicho` en el guion): «Lids», «guatsap».
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

const VELOCIDAD = Number(process.env.VELOCIDAD_GUIA ?? 148);
let VOZ = process.env.VOZ_GUIA ?? "mb-es3";

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

/** Sintetiza una frase y devuelve su audio ya leído. */
export function sintetizar(texto, archivo) {
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

/** Pega la pista al vídeo: el vídeo se copia tal cual y el audio va en Opus. */
export function mezclar(video, pista, salida) {
    execFileSync(
        "ffmpeg",
        ["-y", "-loglevel", "error", "-i", video, "-i", pista, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "libopus", "-b:a", "64k", "-ar", "48000", salida],
        { stdio: "inherit" },
    );
}

export function guardarWav(ruta, wav) {
    writeFileSync(ruta, wav);
}
