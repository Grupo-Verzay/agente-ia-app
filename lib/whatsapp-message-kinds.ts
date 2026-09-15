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

/**
 * El tipo de verdad de un mensaje, que NO siempre es el que viene rotulado.
 *
 * **UN SOBRE SOLO ES UN SOBRE SI NO TRAE NADA DENTRO**, y esto es lo que lo
 * decide. En un GRUPO, WhatsApp manda el reparto de claves
 * (`senderKeyDistributionMessage`) JUNTO al mensaje, en el mismo `message`, y
 * el aviso entero puede llegar rotulado con el nombre del sobre aunque dentro
 * venga el texto. Escondiendo por el rótulo, ese mensaje no se pintaba: la
 * conversación de grupo iba perdiendo mensajes sola, sin que faltara ni una
 * fila en la base.
 *
 * Duele justo donde se vio: una línea RECIÉN metida en un grupo, porque cada
 * miembro tiene que redistribuirle su clave y los primeros mensajes después de
 * entrar llevan todos el sobre. En un grupo viejo ya está repartida y casi no
 * aparece — de ahí que un grupo se viera completo y el otro no.
 *
 * Un sobre de verdad no tiene ninguna clave de contenido y conserva su nombre,
 * así que se sigue escondiendo igual y no vuelve la burbuja "[Mensaje
 * secretEncryptedMessage]" que motivó esta lista.
 *
 * El backend hace lo mismo, en `utils/sobres-sin-contenido.ts`.
 */
export function tipoRealDeWhatsapp(
  messageType?: string | null,
  message?: Record<string, any> | null,
): string {
  const rotulado = (messageType ?? '').trim();
  if (!SOBRES_SIN_CONTENIDO.has(rotulado)) return rotulado;

  const deVerdad = Object.keys(message ?? {}).find((k) => !SOBRES_SIN_CONTENIDO.has(k));
  return deVerdad ?? rotulado;
}
