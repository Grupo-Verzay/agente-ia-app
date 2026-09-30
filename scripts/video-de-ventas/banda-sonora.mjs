/**
 * La BANDA SONORA del vídeo de ventas: la narración, las dos notas de voz de la
 * historia y el aviso de mensaje entrante del celular, en una sola pista.
 *
 * Las guías montan su pista con `montarLaPista` (`voz-de-la-guia.mjs`), que
 * pone las frases UNA DETRÁS DE OTRA: si dos se pisaran, la segunda se corre.
 * Aquí eso no sirve: el aviso del celular suena mientras habla el narrador, y
 * correrlo lo despegaría del mensaje que lo dispara. Así que esto SUMA —cada
 * sonido en su instante, con su ganancia— y lo que se cuida es otra cosa: que
 * la NARRACIÓN no se pise nunca con una nota de voz (dos voces a la vez no se
 * entienden), que lo comprueba `sePisanLasVoces` y el banco.
 *
 * Todo es puro y trabaja con el audio de `leerWav` (PCM mono de 16 bits).
 */
import { escribirWav } from "../voz-de-la-guia.mjs";

/**
 * Qué trozo de cada nota de voz suena en el vídeo. La nota ENTERA se manda y se
 * ve con su duración (0:07, 0:09), como en WhatsApp; lo que suena es su
 * primera idea, cortado en un silencio medido (`lasPausas`): la clienta hasta
 * «¿Tienen financiación?» y Sofía desde su primera palabra hasta «sin
 * interés.». Un vídeo de un minuto y medio no aguanta dieciséis segundos de
 * notas, y cortarlas a media palabra se oiría como un fallo.
 */
export const CORTES_DE_LAS_NOTAS = Object.freeze({
    clienta: { desdeMs: 0, hastaMs: 3700 },
    ia: { desdeMs: 640, hastaMs: 4800 },
});

/** El fundido de cada corte, para que no chasquee. */
export const FUNDIDO_DEL_CORTE_MS = 25;

/**
 * Las ganancias: la narración manda y todo lo demás va por debajo. Las notas
 * un poco por debajo de la voz del narrador —son audio de un celular—, y el
 * aviso muy por debajo: se nota, no distrae.
 */
export const GANANCIA = Object.freeze({ narracion: 1, nota: 0.85, aviso: 0.22, tono: 0.3, llamada: 0.95 });

/** Un trozo de un audio, con un fundido corto en cada punta. */
export function recortarAudio(audio, { desdeMs = 0, hastaMs = audio.ms, fundidoMs = FUNDIDO_DEL_CORTE_MS } = {}) {
    const muestras = (ms) => Math.round((ms * audio.frecuencia) / 1000);
    const total = audio.datos.length / 2;
    const a = Math.max(0, Math.min(total, muestras(desdeMs)));
    const b = Math.max(a, Math.min(total, muestras(hastaMs)));
    const n = b - a;
    const f = Math.min(Math.floor(n / 2), Math.max(1, muestras(fundidoMs)));
    const datos = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i += 1) {
        let x = audio.datos.readInt16LE((a + i) * 2);
        if (i < f) x = Math.round((x * i) / f);
        if (n - 1 - i < f) x = Math.round((x * (n - 1 - i)) / f);
        datos.writeInt16LE(x, i * 2);
    }
    return { ...audio, datos, ms: Math.round((n / audio.frecuencia) * 1000) };
}

/**
 * El aviso de mensaje entrante: dos notas cortas y suaves, subiendo (una
 * quinta), con su envolvente. Se sintetiza aquí: nada de sonidos de terceros.
 */
export function elAvisoDeMensaje(frecuencia = 24000) {
    const notas = [
        { hz: 987.77, desde: 0, dura: 0.09 },
        { hz: 1479.98, desde: 0.085, dura: 0.16 },
    ];
    const largo = Math.ceil(frecuencia * 0.27);
    const datos = Buffer.alloc(largo * 2);
    for (let i = 0; i < largo; i += 1) {
        const t = i / frecuencia;
        let s = 0;
        for (const n of notas) {
            const u = t - n.desde;
            if (u < 0 || u > n.dura) continue;
            const ataque = Math.min(1, u / 0.006);
            const caida = Math.exp(-u * 18);
            s += Math.sin(2 * Math.PI * n.hz * u) * ataque * caida + 0.25 * Math.sin(4 * Math.PI * n.hz * u) * ataque * caida * caida;
        }
        datos.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * 0.6)) * 32767), i * 2);
    }
    return { frecuencia, canales: 1, bits: 16, datos, ms: Math.round((largo / frecuencia) * 1000) };
}

/**
 * El tono de llamada saliente: dos timbrazos (440 + 480 Hz, el de siempre), de
 * `timbre` segundos con `pausa` entre ellos. Se sintetiza aquí, como el aviso.
 */
export function elTonoDeLlamada(frecuencia = 24000, { veces = 2, timbre = 1.0, pausa = 0.7 } = {}) {
    const largo = Math.ceil(frecuencia * (veces * timbre + (veces - 1) * pausa));
    const datos = Buffer.alloc(largo * 2);
    for (let i = 0; i < largo; i += 1) {
        const t = i / frecuencia;
        const ciclo = t % (timbre + pausa);
        let s = 0;
        if (ciclo < timbre) {
            const env = Math.min(1, ciclo / 0.02, (timbre - ciclo) / 0.02);
            s = (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.5 * env;
        }
        datos.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * 0.6)) * 32767), i * 2);
    }
    return { frecuencia, canales: 1, bits: 16, datos, ms: Math.round((largo / frecuencia) * 1000) };
}

/**
 * La voz «por teléfono»: un pasa-banda de 300 a 3.400 Hz (un paso alto y uno
 * bajo de un polo, dos veces cada uno), que es lo que hace sonar una voz a
 * llamada y no a nota de voz. Pura: devuelve otro audio del mismo largo.
 */
export function porTelefono(audio, { bajo = 300, alto = 3400 } = {}) {
    const { frecuencia, datos } = audio;
    const n = datos.length / 2;
    const dt = 1 / frecuencia;
    const aHp = 1 / (1 + 2 * Math.PI * bajo * dt);
    const aLp = (2 * Math.PI * alto * dt) / (1 + 2 * Math.PI * alto * dt);
    let x = new Float64Array(n);
    for (let i = 0; i < n; i += 1) x[i] = datos.readInt16LE(i * 2) / 32768;
    for (let pasada = 0; pasada < 2; pasada += 1) {
        const hp = new Float64Array(n);
        for (let i = 1; i < n; i += 1) hp[i] = aHp * (hp[i - 1] + x[i] - x[i - 1]);
        const lp = new Float64Array(n);
        for (let i = 1; i < n; i += 1) lp[i] = lp[i - 1] + aLp * (hp[i] - lp[i - 1]);
        x = lp;
    }
    const salida = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i += 1) salida.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i] * 1.4)) * 32767), i * 2);
    return { ...audio, datos: salida };
}

/**
 * ¿Se pisa alguna nota de voz con la narración? Devuelve los choques. Los
 * avisos y el tono de llamada no cuentan: suenan por debajo, no son una voz.
 */
export function sePisanLasVoces(tramos) {
    const voces = tramos.filter((t) => t.clase !== "aviso" && t.clase !== "tono").map((t) => ({ ...t, finMs: t.inicioMs + t.audio.ms }));
    const choques = [];
    for (let i = 0; i < voces.length; i += 1) {
        for (let j = i + 1; j < voces.length; j += 1) {
            const a = voces[i];
            const b = voces[j];
            if (a.clase === "narracion" && b.clase === "narracion") continue; // la narración ya va en fila
            const pisa = Math.min(a.finMs, b.finMs) - Math.max(a.inicioMs, b.inicioMs);
            if (pisa > 0) choques.push({ a: a.texto ?? a.clase, b: b.texto ?? b.clase, ms: pisa });
        }
    }
    return choques;
}

/**
 * Suma cada tramo en su instante (`inicioMs`), con la ganancia de su clase, y
 * devuelve el WAV entero. Satura con tope en vez de dar la vuelta: un pico
 * recortado se oye menos que un chasquido.
 */
export function mezclarLaBanda(tramos, totalMs) {
    if (!tramos.length) throw new Error("[video] no hay nada que mezclar");
    const frecuencia = tramos[0].audio.frecuencia;
    const total = Math.ceil((totalMs * frecuencia) / 1000);
    const suma = new Float64Array(total);
    const colocados = [];
    for (const t of tramos) {
        if (t.audio.frecuencia !== frecuencia) throw new Error("[video] los audios no tienen la misma frecuencia");
        const g = GANANCIA[t.clase] ?? 1;
        const inicio = Math.max(0, Math.round((t.inicioMs * frecuencia) / 1000));
        const n = Math.min(t.audio.datos.length / 2, total - inicio);
        if (n <= 0) throw new Error(`[video] «${t.texto ?? t.clase}» cae fuera del vídeo`);
        for (let i = 0; i < n; i += 1) suma[inicio + i] += t.audio.datos.readInt16LE(i * 2) * g;
        colocados.push({ clase: t.clase, texto: t.texto, inicioMs: Math.round((inicio / frecuencia) * 1000), finMs: Math.round(((inicio + n) / frecuencia) * 1000) });
    }
    const datos = Buffer.alloc(total * 2);
    for (let i = 0; i < total; i += 1) datos.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(suma[i]))), i * 2);
    return { wav: escribirWav(datos, frecuencia), colocados };
}

/** «0:07»: la duración de una nota como la escribe WhatsApp. */
export const comoDuracion = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
