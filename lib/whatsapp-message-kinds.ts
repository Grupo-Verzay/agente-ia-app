/**
 * Sobres internos de WhatsApp: eventos que viajan como si fueran un mensaje pero
 * no llevan nada que se pueda leer.
 *
 * `secretEncryptedMessage` es el que deja una EDICIÓN (y también los votos de una
 * encuesta): su contenido va cifrado con una clave derivada del mensaje original,
 * así que ni Evolution ni la plataforma pueden abrirlo. Los otros tres son
 * fontanería del protocolo —reparto de claves de grupo, metadatos de contexto,
 * el voto cifrado de una encuesta— y tampoco tienen texto.
 *
 * Se guardaban y salían en el chat como una burbuja "[Mensaje
 * secretEncryptedMessage]" justo debajo del mensaje editado. No hay contenido que
 * rescatar, así que lo correcto es no tratarlos como mensajes: el original ya está
 * ahí arriba y no se pierde nada.
 */
const SOBRES_SIN_CONTENIDO = new Set([
  'secretEncryptedMessage',
  'pollUpdateMessage',
  'senderKeyDistributionMessage',
  'messageContextInfo',
]);

export function esSobreInternoDeWhatsapp(messageType?: string | null): boolean {
  return SOBRES_SIN_CONTENIDO.has((messageType ?? '').trim());
}
