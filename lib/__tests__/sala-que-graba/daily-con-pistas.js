// Un Daily de mentira con PISTAS DE VERDAD: el avatar es un lienzo animado
// (video) y un oscilador (voz), y el micrófono del cliente es otro oscilador.
// Así la grabación de la sala mezcla y dibuja medios reales, y el banco puede
// medir que el fichero suena y se ve.
const oyentes = {};
const ctx = new AudioContext();
function tono(frecuencia) {
    const o = ctx.createOscillator();
    o.frequency.value = frecuencia;
    const g = ctx.createGain();
    g.gain.value = 0.3;
    const d = ctx.createMediaStreamDestination();
    o.connect(g).connect(d);
    o.start();
    return d.stream.getAudioTracks()[0];
}
const lienzo = document.createElement("canvas");
lienzo.width = 640;
lienzo.height = 360;
const pinta = lienzo.getContext("2d");
let n = 0;
setInterval(() => {
    n += 1;
    pinta.fillStyle = `hsl(${(n * 7) % 360} 70% 45%)`;
    pinta.fillRect(0, 0, 640, 360);
    pinta.fillStyle = "#fff";
    pinta.font = "48px sans-serif";
    pinta.fillText(`Verzy ${n}`, 40, 200);
}, 50);
const avatarVideo = lienzo.captureStream(20).getVideoTracks()[0];
const avatarAudio = tono(440);
const micro = tono(660);
// `?conCliente=1`: además del avatar hay un CLIENTE en la sala (una persona
// sin la marca de asesor). `window.__daily.saleElCliente()` lo saca.
let conCliente = new URLSearchParams(location.search).get("conCliente") === "1";
const cliente = {
    session_id: "cliente",
    user_name: "Cliente",
    local: false,
    userData: { humano: true },
    tracks: { audio: { state: "playable", persistentTrack: tono(550) } },
};

const avatar = {
    session_id: "avatar",
    user_name: "Tavus replica",
    local: false,
    tracks: {
        video: { state: "playable", persistentTrack: avatarVideo },
        audio: { state: "playable", persistentTrack: avatarAudio },
    },
};
const llamada = {
    on(ev, fn) { (oyentes[ev] ??= []).push(fn); return llamada; },
    off() { return llamada; },
    participants() {
        return {
            local: { local: true, video: true, audio: true, tracks: { audio: { state: "playable", persistentTrack: micro } } },
            avatar,
            ...(conCliente ? { cliente } : {}),
        };
    },
    leave() { return Promise.resolve(); },
    join() {
        setTimeout(() => {
            (oyentes["joined-meeting"] ?? []).forEach((f) => f({}));
            (oyentes["track-started"] ?? []).forEach((f) => f({}));
        }, 50);
        return Promise.resolve();
    },
    destroy() { return Promise.resolve(); },
    sendAppMessage() {},
    setLocalVideo() {},
    setLocalAudio() {},
    startScreenShare() {},
    stopScreenShare() {},
};
window.__daily = {
    disparar(ev, datos) { (oyentes[ev] ?? []).forEach((f) => f(datos)); },
    saleElCliente() {
        conCliente = false;
        window.__daily.disparar("participant-left", { participant: cliente });
    },
};
export default { createCallObject: () => llamada };
