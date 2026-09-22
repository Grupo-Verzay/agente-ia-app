/**
 * La entrada que se empaqueta para el banco de «la llamada es de la cuenta
 * dueña de la conversación».
 *
 * Lo que se finge (`currentUser()` y el paquete `openai`) entra por alias de
 * esbuild, así que queda **dentro** del paquete: importándolo aparte desde el
 * banco se movería otra copia y `ponerAQuienMira` no tendría efecto.
 *
 * Lo que sale por aquí son **las acciones de verdad** que lanza la pantalla:
 * llamar con IA, llamar a mano, procesar la grabación desde la tarjeta y leer
 * el CRM de Llamadas.
 */
export { ponerAQuienMira } from "./auth-de-llamadas";
export { olvidarLoPedido, loQueSeLePidioALaIa } from "./ia-de-mentira";

export { startBotCallAction } from "@/actions/voicebot-actions";
export { startAstraCall } from "@/actions/astracalls-actions";
export { processCallRecordingAction } from "@/actions/calls-recording-actions";
export { getCallsCrmData } from "@/actions/calls-crm-actions";
export { ESPERA_ENTRE_INTENTOS_MS } from "@/lib/grabacion-de-llamada.server";
export { costoDeLaNota } from "@/lib/transcripcion-de-voz";

export { db } from "@/lib/db";
