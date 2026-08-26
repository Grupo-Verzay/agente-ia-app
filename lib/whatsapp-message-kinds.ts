/**
 * Sobres internos de WhatsApp: eventos que viajan como si fueran un mensaje pero
 * no llevan nada que se pueda leer.
 *
 * `secretEncryptedMessage` es el que deja una EDICIÓN (y también los votos de una
 * encuesta): su contenido va cifrado con una clave derivada del mensaje original,
 * así que ni Evolution ni la plataforma pueden abrirlo. Los otros son
 * fontanería del protocolo —reparto de claves de grupo, metadatos de contexto,
 * el voto cifrado de una encuesta, fijar y desfijar— y tampoco tienen texto.
 *
 * `pinInChatMessage` es el que deja FIJAR o desfijar un mensaje. No trae el
 * mensaje fijado ni quién lo fijó: solo un puntero al original, que ya está más
 * arriba en la conversación. Salía como una burbuja "[Mensaje
 * pinInChatMessage]" en mitad del chat.
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
  'pinInChatMessage',
]);

export function esSobreInternoDeWhatsapp(messageType?: string | null): boolean {
  return SOBRES_SIN_CONTENIDO.has((messageType ?? '').trim());
}
