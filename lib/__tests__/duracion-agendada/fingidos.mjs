// Los dobles de `abrirLaVideollamada`: la cita, los ajustes y el avatar salen
// de `globalThis.__banco`; Tavus es el `fetch` de mentira del test.
export const db = {
  $queryRaw: async () => [],
  agentPrompt: { findFirst: async () => null },
};
export const laCitaDeLaVideollamada = async () => globalThis.__banco.cita;
export const leerLosAjustes = async () => ({ modo: "tavus", limiteMinutos: globalThis.__banco.limiteDeLaCuenta, disponible: true });
export const elAvatarDeLaCuenta = async () => ({ clave: "clave-de-prueba-123456", personaId: "p-prueba" });
export const laVideollamada = async () => null;
export const reclamarLaCreacion = async () => true;
export const apuntarLaConversacion = async () => undefined;
export const soltarElReclamo = async () => undefined;
export const marcarFinalizada = async () => undefined;
export const marcarQueEntro = async () => undefined;
export const elEnlaceDeLaCita = async (id) => id;
export const laCitaDelEnlace = async () => null;
export const leerElGuionDeVideollamada = async () => null;
export const laPersonaParaLaConversacion = async (t) => t.personaId;
