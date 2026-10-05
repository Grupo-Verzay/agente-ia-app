// COPIA BYTE A BYTE de api-webhook/src/modules/voicebot/contexto-de-la-conversacion.ts.
// La usa la videollamada con IA (Tavus) para darle al avatar el mismo contexto
// que el asistente de voz. Si se toca una, se copia a la otra.

/**
 * Lo que el asistente de voz ya sabe del cliente al que llama: **el chat de
 * WhatsApp de ESA conversación**.
 *
 * # Qué pasaba
 *
 * El bot le decía a todo el mundo el mismo `productos_servicios` —«productos
 * naturales»— sin importar a qué se dedicara cada cliente. No era un valor
 * cacheado ni el contexto de otra conversación: **la conversación no se leía
 * nunca**.
 *
 * `resolve` armaba las instrucciones con una sola cosa, el prompt de la
 * CUENTA, y el `from` —el teléfono al que se llama, lo único que distingue una
 * llamada de otra— solo se usaba para construir las herramientas. Así que las
 * instrucciones de todas las llamadas de una cuenta eran **idénticas, carácter
 * por carácter**.
 *
 * Y el prompt de chat que se reutiliza para la voz está escrito en términos de
 * variables que el chat CAPTURA en la conversación (`nombre`,
 * `productos_servicios`, `dolor_especifico`: ver la plantilla del agente). En
 * un chat esas variables existen porque el historial va delante; en una llamada
 * no iba nada, así que el modelo rellenaba el hueco con lo primero que encaja
 * — y como el prompt es el mismo en todas las llamadas, rellenaba **lo mismo**
 * en todas. Un valor inventado que además no varía se lee como un dato bueno,
 * que es la peor clase de error: nadie lo mira dos veces.
 *
 * # La regla
 *
 * > **Lo que el asistente sabe del cliente sale de SU conversación, y lo que no
 * > esté ahí NO lo sabe.** El bloque va dentro de las instrucciones, que es lo
 * > único que llega al modelo: llamarlo «contexto» en el código no le dice nada
 * > a nadie — es la misma regla de la nota interna de un paso, *una prohibición
 * > que no viaja en el prompt no existe*.
 *
 * Y su otra mitad, que es la que arregla el síntoma de verdad: **cuando no hay
 * conversación se DICE que no la hay**. Sin esa frase el modelo sigue teniendo
 * un prompt que le habla de `productos_servicios` y ningún sitio de donde
 * sacarlo, así que se lo inventa otra vez. Es *un número que no se puede
 * calcular no se sustituye por otro*, aplicado a las variables del chat.
 *
 * Es puro a propósito: lo que decide qué ve el modelo se prueba sin base y sin
 * llamada.
 */

/** Un mensaje del chat, ya resuelto de quién es. */
export type MensajeDelChat = {
  /** `true` lo escribió el contacto; `false` salió de nuestro lado (asesor o IA). */
  delCliente: boolean;
  texto: string;
};

/**
 * Cuántos mensajes viajan, cuánto de cada uno y cuánto el bloque entero.
 *
 * Son topes de lo que se le MANDA al modelo, no de lo que se lee: las
 * instrucciones de una sesión Realtime se mandan enteras en cada llamada y se
 * pagan por token. Veinte mensajes cubren de sobra el tramo que importa —lo
 * último que se habló— y el tope por mensaje evita que un solo texto pegado
 * (una cotización entera, un catálogo) se coma el bloque.
 */
export const TOPE_DE_MENSAJES = 20;
export const TOPE_POR_MENSAJE = 300;
export const TOPE_DEL_BLOQUE = 4000;

const SIN_CONVERSACION = [
  'CONTEXTO: no tienes ninguna conversación previa de WhatsApp con este contacto.',
  'No sabes su nombre, ni a qué se dedica, ni qué productos o servicios le interesan, ni qué habló antes con nosotros.',
  'NO te inventes ninguno de esos datos ni los des por supuestos: pregúntaselos.',
].join('\n');

function recortar(texto: string, tope: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length > tope ? `${limpio.slice(0, tope).trimEnd()}…` : limpio;
}

/**
 * El bloque que se le añade a las instrucciones para ESTA llamada.
 *
 * `mensajes` llega en orden cronológico (viejo → nuevo) y se queda con los
 * últimos {@link TOPE_DE_MENSAJES}: lo que decide una llamada es lo último que
 * se habló, no el principio de la conversación. Es la misma corrección que ya
 * costó una vuelta en `getChatHistory`, que traía los 30 PRIMEROS mensajes y
 * dejaba a la IA congelada en el arranque del chat.
 *
 * Devuelve SIEMPRE un bloque: sin conversación devuelve el que dice que no la
 * hay, que es justo el caso que había que cerrar.
 */
export function elContextoDeLaConversacion(input: {
  nombre?: string | null;
  mensajes: MensajeDelChat[];
}): string {
  const nombre = (input.nombre ?? '').trim();
  const mensajes = (input.mensajes ?? [])
    .map((m) => ({ delCliente: m.delCliente, texto: recortar(m.texto ?? '', TOPE_POR_MENSAJE) }))
    .filter((m) => m.texto.length > 0)
    .slice(-TOPE_DE_MENSAJES);

  // Un nombre suelto no es una conversación, pero tampoco es nada: si lo único
  // que hay es el nombre, se da el nombre y se dice que del resto no se sabe.
  if (mensajes.length === 0) {
    return nombre ? `${SIN_CONVERSACION}\nLo único que sabes es cómo se llama: ${nombre}.` : SIN_CONVERSACION;
  }

  const lineas = mensajes.map((m) => `${m.delCliente ? 'Cliente' : 'Nosotros'}: ${m.texto}`);
  // Se recorta por el PRINCIPIO, tirando mensajes enteros: lo reciente es lo
  // que decide la llamada, y cortar a mitad de una frase deja al modelo
  // completando lo que falta — que es exactamente lo que esto viene a evitar.
  while (lineas.join('\n').length > TOPE_DEL_BLOQUE && lineas.length > 1) {
    lineas.shift();
  }
  const conversacion = lineas.join('\n').slice(0, TOPE_DEL_BLOQUE);

  return [
    'CONTEXTO DE ESTE CLIENTE (su chat de WhatsApp con nosotros, lo más reciente al final).',
    'Esto es lo ÚNICO que sabes de él: lo que no aparezca aquí no lo sabes.',
    nombre ? `Se llama: ${nombre}` : '',
    '--- conversación ---',
    conversacion,
    '--- fin de la conversación ---',
    'Habla como quien ya tuvo esa conversación: no la repitas ni la leas en voz alta, continúala.',
    'NO cambies por otros los productos, servicios, necesidades ni datos del negocio que salgan ahí, y NO supongas los que no salgan: si te hace falta uno que no está, pregúntalo.',
  ]
    .filter(Boolean)
    .join('\n');
}
