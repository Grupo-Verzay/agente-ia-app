/**
 * Las medidas de un vídeo de guía, con ffmpeg: qué pistas lleva, dónde calla,
 * dónde acaba cada pista y cuándo cambia el rótulo de abajo. Las usan los
 * bancos de los vídeos de todas las guías (`video-guia-*.test.mjs`): con una
 * copia en cada uno, el día que se afine un umbral uno de los dos mediría otra
 * cosa.
 */
import { execFileSync, spawnSync } from "node:child_process";

export function pistas(archivo) {
    const r = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "json", archivo]);
    return JSON.parse(String(r));
}
/**
 * Los silencios de la pista de un vídeo, con el mismo umbral que `RITMO`
 * (−40 dB) y a partir de 350 ms, que es lo que ya se oye como un hueco.
 */
export function silencios(archivo) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", archivo, "-map", "0:a:0", "-af", "silencedetect=noise=-40dB:d=0.35", "-f", "null", "-"], { encoding: "utf8" });
    const inicios = [...r.stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]));
    const finales = [...r.stderr.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => ({ fin: Number(m[1]), dura: Number(m[2]) }));
    return inicios.map((inicio, i) => ({ inicio, fin: finales[i]?.fin ?? null, dura: finales[i]?.dura ?? null }));
}
/** Los huecos que suenan como tales: los de DENTRO del vídeo (ni el principio ni la cola). */
export function huecos(archivo) {
    const todos = silencios(archivo);
    const duracion = Number(pistas(archivo).format.duration);
    return {
        alEmpezar: todos[0] && todos[0].inicio < 0.05 ? todos[0].dura : 0,
        dentro: todos.filter((x) => x.inicio >= 0.05 && x.fin !== null && x.fin < duracion - 0.5).map((x) => x.dura),
    };
}
/** Dónde acaba una pista (su último paquete): la imagen y la voz pueden acabar a destiempo. */
export function finDeLaPista(archivo, pista) {
    const r = execFileSync("ffprobe", ["-v", "error", "-select_streams", `${pista}:0`, "-show_entries", "packet=pts_time", "-of", "csv=p=0", archivo], { maxBuffer: 64 << 20 });
    const tiempos = String(r).split("\n").map((l) => Number.parseFloat(l)).filter(Number.isFinite);
    return Math.max(...tiempos);
}
export const finDelAudio = (archivo) => finDeLaPista(archivo, "a");
/**
 * Cuándo cambia el rótulo de abajo, que se pone al empezar cada frase: el
 * recuadro del centro de la parte de abajo cambia de golpe (texto blanco sobre
 * fondo oscuro). Es la marca con la que se mide si la imagen va con la voz.
 * El recorte es el de un vídeo de 1280×800, que es como se graban todos.
 */
export function cambiosDelRotulo(archivo) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", archivo, "-an", "-vf", "crop=380:34:450:726,select='gt(scene\\,0.08)',showinfo", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
    return [...r.stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}
/** Hasta dónde se habla: el final del último tramo con voz, aunque la pista siga muda detrás. */
export function dondeCallaDelTodo(archivo) {
    const todos = silencios(archivo);
    const ultimo = todos[todos.length - 1];
    const fin = finDelAudio(archivo);
    return ultimo && (ultimo.fin === null || ultimo.fin >= fin - 0.1) ? ultimo.inicio : fin;
}
export function volumenMedio(archivo) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", archivo, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
    const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr);
    return m ? Number(m[1]) : null;
}
/** El tamaño del vídeo: todos se graban a 1280×800, y el recorte del rótulo cuenta con ello. */
export function tamano(archivo) {
    const r = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", archivo]);
    const s = JSON.parse(String(r)).streams[0];
    return { ancho: s.width, alto: s.height };
}
