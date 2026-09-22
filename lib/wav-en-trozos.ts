/**
 * Un WAV largo, en trozos que OpenAI sí acepta.
 *
 * Puro a propósito, como el resto de lo que decide sobre una grabación: de
 * aquí tiran la maquinaria del servidor y el banco, y así se prueba sin
 * levantar nada.
 *
 * # Por qué hace falta
 *
 * El WAV que graba el servidor de llamadas es PCM de 16 kHz, **dos canales** y
 * 16 bits: exactamente **64.000 bytes por segundo**. El tope de una
 * transcripción de OpenAI son 25 MB, así que una llamada de más de
 * **6 minutos y 49 segundos** ya no cabe — y una llamada con IA de varios
 * minutos lo pasa sin esfuerzo.
 *
 * Eso no se veía como un tope: se veía como «la llamada no deja ni
 * transcripción ni resumen», porque la decisión de no transcribir era FIRME y
 * además se llevaba por delante la duración.
 *
 * No hay forma de comprimir sin un codec —Node no trae ninguno y el
 * contenedor de la App no tiene `ffmpeg`— así que lo que sí se puede es
 * **cortar**: el audio ya está en PCM, así que un trozo es un `subarray` de
 * los datos con un encabezado nuevo delante. Los textos se pegan en orden.
 */

/** Lo que hace falta saber de un WAV para poder cortarlo. */
export interface FormatoDelWav {
    canales: number;
    sampleRate: number;
    bitsPorMuestra: number;
    /** Dónde empiezan los datos de audio dentro del buffer. */
    inicioDeDatos: number;
    /** Cuántos bytes de audio hay. */
    bytesDeDatos: number;
    /** Bytes de un instante de audio: `bits/8 * canales`. Nunca cero. */
    bytesPorMuestra: number;
}

/**
 * Lee el encabezado de un WAV PCM. Devuelve `null` si no lo es.
 *
 * Recorre los chunks hasta `data` en vez de dar por hecho que está en el
 * offset 44: es la misma cautela que ya tiene `duracionDelWav`, y un WAV con
 * un chunk `LIST` delante es perfectamente normal.
 */
export function elFormatoDelWav(buffer: Buffer): FormatoDelWav | null {
    if (buffer.length < 44) return null;
    if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
    if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

    let canales = 0;
    let sampleRate = 0;
    let bitsPorMuestra = 0;
    let offset = 12;

    while (offset + 8 <= buffer.length) {
        const id = buffer.toString("ascii", offset, offset + 4);
        const tamano = buffer.readUInt32LE(offset + 4);
        const cuerpo = offset + 8;

        if (id === "fmt " && cuerpo + 16 <= buffer.length) {
            canales = buffer.readUInt16LE(cuerpo + 2);
            sampleRate = buffer.readUInt32LE(cuerpo + 4);
            bitsPorMuestra = buffer.readUInt16LE(cuerpo + 14);
        } else if (id === "data") {
            const bytesPorMuestra = (bitsPorMuestra / 8) * canales;
            if (!canales || !sampleRate || !bitsPorMuestra || !bytesPorMuestra) return null;
            // El tamaño declarado puede mentir —un WAV que se cerró a lo bruto—
            // así que manda lo que de verdad hay en el buffer.
            const bytesDeDatos = Math.min(tamano, buffer.length - cuerpo);
            if (bytesDeDatos <= 0) return null;
            return { canales, sampleRate, bitsPorMuestra, inicioDeDatos: cuerpo, bytesDeDatos, bytesPorMuestra };
        }
        // Los chunks van alineados a 2 bytes.
        offset = cuerpo + tamano + (tamano % 2);
    }
    return null;
}

/** La duración de un WAV, en segundos, a partir de su propio encabezado. */
export function segundosDelWav(buffer: Buffer): number {
    const f = elFormatoDelWav(buffer);
    if (!f) return 0;
    return Math.round(f.bytesDeDatos / f.bytesPorMuestra / f.sampleRate);
}

/** El encabezado de 44 bytes de un WAV PCM con estos datos dentro. */
function encabezado(f: FormatoDelWav, bytesDeDatos: number): Buffer {
    const h = Buffer.alloc(44);
    const byteRate = f.sampleRate * f.bytesPorMuestra;
    h.write("RIFF", 0, "ascii");
    h.writeUInt32LE(36 + bytesDeDatos, 4);
    h.write("WAVE", 8, "ascii");
    h.write("fmt ", 12, "ascii");
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20); // PCM
    h.writeUInt16LE(f.canales, 22);
    h.writeUInt32LE(f.sampleRate, 24);
    h.writeUInt32LE(byteRate, 28);
    h.writeUInt16LE(f.bytesPorMuestra, 32);
    h.writeUInt16LE(f.bitsPorMuestra, 34);
    h.write("data", 36, "ascii");
    h.writeUInt32LE(bytesDeDatos, 40);
    return h;
}

/**
 * Parte un WAV en trozos que no pasen de `topeDeBytes`, cada uno con su propio
 * encabezado.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Un WAV que ya cabe sale TAL CUAL**, sin copiarlo ni reescribirle el
 *    encabezado. Es el caso normal —una llamada corta— y no tiene por qué
 *    pagar nada.
 * 2. **Lo que no se entienda sale entero**, en un solo trozo. Aquí equivocarse
 *    hacia «no lo toco» manda un audio que OpenAI quizá rechace; equivocarse
 *    hacia «lo corto igual» manda basura que seguro no se entiende.
 * 3. **El corte va alineado a `bytesPorMuestra`.** Cortando a mitad de una
 *    muestra, el trozo siguiente sale con los canales cambiados de sitio y se
 *    oye como ruido — y eso no da ningún error: da una transcripción mala.
 */
export function trozosDeWav(buffer: Buffer, topeDeBytes: number): Buffer[] {
    if (buffer.length <= topeDeBytes) return [buffer];

    const f = elFormatoDelWav(buffer);
    if (!f) return [buffer];

    // Cuántos bytes de AUDIO caben en un trozo, descontando su encabezado y
    // alineados a una muestra entera.
    const cabenEnUnTrozo = Math.floor((topeDeBytes - 44) / f.bytesPorMuestra) * f.bytesPorMuestra;
    if (cabenEnUnTrozo <= 0) return [buffer];

    const trozos: Buffer[] = [];
    for (let desde = 0; desde < f.bytesDeDatos; desde += cabenEnUnTrozo) {
        const cuantos = Math.min(cabenEnUnTrozo, f.bytesDeDatos - desde);
        const datos = buffer.subarray(f.inicioDeDatos + desde, f.inicioDeDatos + desde + cuantos);
        trozos.push(Buffer.concat([encabezado(f, cuantos), datos]));
    }
    return trozos;
}

/**
 * Cuántos trozos harían falta para este audio. Es lo que decide si se
 * transcribe o si de verdad es inabarcable.
 */
export function cuantosTrozos(bytes: number, topeDeBytes: number): number {
    if (bytes <= topeDeBytes) return 1;
    return Math.ceil(bytes / (topeDeBytes - 44));
}
