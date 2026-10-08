// Un Daily de mentira para montar la sala REAL en el navegador: guarda lo que
// la sala manda y deja que la prueba dispare los eventos de Tavus.
const oyentes = {};
const enviados = [];
let salidas = 0;
const remotos = {};
let audioLocal = true;
const llamada = {
    on(ev, fn) { (oyentes[ev] ??= []).push(fn); return llamada; },
    off() { return llamada; },
    participants() { return { local: { local: true, video: true, audio: audioLocal, tracks: {} }, ...remotos }; },
    leave() { salidas++; setTimeout(() => (oyentes["left-meeting"] ?? []).forEach((f) => f({})), 20); return Promise.resolve(); },
    join() { setTimeout(() => (oyentes["joined-meeting"] ?? []).forEach((f) => f({})), 50); return Promise.resolve(); },
    destroy() { return Promise.resolve(); },
    sendAppMessage(m) { enviados.push(m); },
    setLocalVideo() {},
    setLocalAudio(v) { audioLocal = !!v; setTimeout(() => (oyentes["participant-updated"] ?? []).forEach((f) => f({ participant: { local: true } })), 0); }, startScreenShare() {}, stopScreenShare() {},
};
window.__daily = {
    enviados,
    get salidas() { return salidas; },
    remotos,
    disparar(ev, datos) { (oyentes[ev] ?? []).forEach((f) => f(datos)); },
};
export default { createCallObject: () => llamada };
