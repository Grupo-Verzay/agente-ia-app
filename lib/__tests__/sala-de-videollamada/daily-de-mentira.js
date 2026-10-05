// Un Daily de mentira para montar la sala REAL en el navegador: guarda lo que
// la sala manda y deja que la prueba dispare los eventos de Tavus.
const oyentes = {};
const enviados = [];
const llamada = {
    on(ev, fn) { (oyentes[ev] ??= []).push(fn); return llamada; },
    off() { return llamada; },
    participants() { return { local: { video: true, tracks: {} } }; },
    join() { setTimeout(() => (oyentes["joined-meeting"] ?? []).forEach((f) => f({})), 50); return Promise.resolve(); },
    destroy() { return Promise.resolve(); },
    sendAppMessage(m) { enviados.push(m); },
    setLocalVideo() {}, setLocalAudio() {}, startScreenShare() {}, stopScreenShare() {},
};
window.__daily = {
    enviados,
    disparar(ev, datos) { (oyentes[ev] ?? []).forEach((f) => f(datos)); },
};
export default { createCallObject: () => llamada };
