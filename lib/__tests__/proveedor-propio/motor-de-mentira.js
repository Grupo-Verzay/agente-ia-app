// El motor de mentira: el MISMO contrato que `conectarElMotor` (la voz, enviar,
// alEvento, alCaerse, cambiarLaEntrada, cerrar), sin OpenAI. La voz de Verzy es
// un tono que la prueba enciende y apaga; lo que la sala le manda se apunta.
const oyentes = [];
const caidas = [];
const enviados = [];
let ganancia = null;
window.__motor = {
  enviados,
  conectado: false,
  entradas: 0,
  disparar(evento) { oyentes.forEach((f) => f(evento)); },
  hablar(si) { if (ganancia) ganancia.gain.value = si ? 0.8 : 0; },
  caer(porque) { caidas.forEach((f) => f(porque)); },
};
export const ESPERA_DEL_MOTOR_MS = 15_000;
export async function conectarElMotor({ clave, entrada }) {
  window.__motor.clave = clave;
  window.__motor.entrada = entrada ? entrada.kind : null;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.frequency.value = 220;
  ganancia = ctx.createGain();
  ganancia.gain.value = 0;
  const destino = ctx.createMediaStreamDestination();
  osc.connect(ganancia).connect(destino);
  osc.start();
  window.__motor.conectado = true;
  return {
    voz: destino.stream.getAudioTracks()[0],
    enviar: (e) => enviados.push(e),
    alEvento: (fn) => oyentes.push(fn),
    alCaerse: (fn) => caidas.push(fn),
    cambiarLaEntrada: () => { window.__motor.entradas++; },
    cerrar: () => { window.__motor.conectado = false; osc.stop(); },
  };
}
