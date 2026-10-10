// Los dobles del servidor del proveedor propio: todo sale de `globalThis.__banco`
// y todo lo que se escribe se APUNTA en `globalThis.__banco.apuntes`.
const b = () => globalThis.__banco;
const apuntar = (que, datos) => b().apuntes.push({ que, ...datos });

// abrirLaVideollamada
export const db = { $queryRaw: async () => [], agentPrompt: { findFirst: async () => null } };
export const laCitaDeLaVideollamada = async () => b().cita;
export const leerLosAjustes = async () => b().ajustes;
export const elAvatarDeLaCuenta = async () => (b().sinTavus ? null : { clave: "clave-de-prueba-123456", personaId: "p-prueba" });
export const laVideollamada = async () => b().fila ?? null;
export const reclamarLaCreacion = async () => true;
export const apuntarLaConversacion = async (citaId, conversacionId, url) => {
  apuntar("conversacion", { citaId, conversacionId, url });
  b().fila = { citaId, cuentaId: b().cita.userId, conversacionId, conversacionUrl: url, estado: "activa", entroEn: null, transcripcion: null, mensajeId: null };
};
export const soltarElReclamo = async () => undefined;
export const marcarFinalizada = async (citaId) => apuntar("finalizada", { citaId });
export const marcarQueEntro = async () => undefined;
export const elEnlaceDeLaCita = async (id) => id;
export const laCitaDelEnlace = async () => null;
export const leerElGuionDeVideollamada = async () => null;
export const laPersonaParaLaConversacion = async (t) => t.personaId;

// El motor
export const laClaveDeOpenAi = async () => b().claveDeOpenAi ?? null;
export const antesDeUsarLaIa = async () => (b().sinCreditos ? { ok: false, saldo: {}, motivo: "sin_creditos", aviso: "sin créditos" } : { ok: true, saldo: { cobra: true } });
export const cobrarElUsoDeIa = async (cuenta, saldo, uso, donde) => { apuntar("cobro", { cuenta, tokens: uso.tokens, donde }); return uso.tokens; };
export const laLineaDeWhatsappDeLaCuenta = async () => ({ linea: { voicebotVoice: b().voz ?? null } });
export const elContextoDeLaCitaParaElMotor = async (citaId, yaHablado) => ({ cuentaId: b().cita.userId, negocio: "Verzay", contexto: `CONTEXTO DE LA CITA ${citaId}${yaHablado ? `\nYA HABLADO: ${yaHablado}` : ""}` });
export const procesarElAvisoDeTavus = async (citaId, cuerpo) => { apuntar("aviso", { citaId, cuerpo }); return { hecho: "transcripcion" }; };
export const laConversacionDelMotor = async () => b().motor ?? null;
export const guardarLasFrases = async (citaId, conversacionId, frases) => {
  apuntar("frases", { citaId, conversacionId, frases });
  const m = b().motor;
  b().motor = { citaId, conversacionId, frases, tokens: m?.conversacionId === conversacionId ? m.tokens : 0, empezoEn: m?.empezoEn ?? new Date(Date.now() - 60_000), entregadaEn: m?.conversacionId === conversacionId ? m.entregadaEn : null };
};
export const sumarLosTokens = async (citaId, tokens) => { b().motor.tokens += tokens; };
export const reclamarLaEntrega = async (citaId, conversacionId) => {
  const m = b().motor;
  if (!m || m.conversacionId !== conversacionId || m.entregadaEn) return false;
  m.entregadaEn = new Date();
  return true;
};
export const lasConversacionesQuietas = async () => [];
export const barrerLaSala = async () => undefined;
