import { cn } from '@/lib/utils';
import { esSobreInternoDeWhatsapp } from '@/lib/whatsapp-message-kinds';
import { epochToMs } from './chat-sidebar.utils';
import type { EvolutionMessage } from '@/actions/chat-actions';
import type { MediaType } from './attachment-menu';
import type { MediaData, MessageDeliveryState, UIBubble } from './chat-message-types';

/* ─── Formatters ───
 * Sin timeZone fijo: usan la zona horaria LOCAL del navegador de cada usuario,
 * para que cada quien vea la hora de su país (México, R. Dominicana, etc.),
 * no la de Colombia.
 */
export const CHAT_TIME_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const CHAT_DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const CHAT_DATE_BADGE_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/* ─── Helpers ─── */
export function two(n: number) {
  return n.toString().padStart(2, '0');
}

export function formatSecs(s: number) {
  return `${two(Math.floor(s / 60))}:${two(s % 60)}`;
}

export function initialFromName(name?: string) {
  const c = (name || '').trim().charAt(0);
  return c ? c.toUpperCase() : 'U';
}

export function getCalendarDayKey(timestamp?: number): string {
  if (!timestamp) return '';
  const parts = CHAT_DAY_KEY_FORMATTER.formatToParts(new Date(timestamp));
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

export function formatConversationDateLabel(timestamp?: number): string {
  if (!timestamp) return '';
  const formatted = CHAT_DATE_BADGE_FORMATTER.format(new Date(timestamp));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function base64FromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Error leyendo blob'));
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const commaIndex = dataUrl.indexOf(',');
      if (commaIndex === -1) return reject(new Error('Formato de Data URL inválido.'));
      resolve(dataUrl.substring(commaIndex + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Lo que se enseña cuando el mensaje trae adjunto pero el archivo no esta.
 *
 * Sin esto la burbuja se quedaba en blanco: `media` nulo y `content` vacio no
 * pintan nada, solo la hora. Es el mismo fallo mudo del que habla el CLAUDE.md
 * -desde fuera se ve como un mensaje que no llego- y pasaba con cualquier
 * adjunto cuyo archivo aun no estuviera guardado.
 *
 * Se dice el tipo y, en un documento, su nombre: con eso el asesor sabe que
 * hay algo y puede pedirlo por otro camino.
 */
export function etiquetaDeAdjuntoSinArchivo(type: MediaType, msg: any): string {
  const info = msg?.[`${type}Message`] ?? {};
  const caption = typeof info.caption === 'string' ? info.caption.trim() : '';
  const nombre =
    typeof info.fileName === 'string' && info.fileName.trim()
      ? info.fileName.trim()
      : typeof info.title === 'string' && info.title.trim()
        ? info.title.trim()
        : '';
  const etiquetas: Record<MediaType, string> = {
    image: '🖼️ Imagen',
    video: '🎬 Video',
    audio: '🎧 Audio',
    document: '📄 Documento',
  };
  const cabecera = nombre ? `${etiquetas[type]}: ${nombre}` : etiquetas[type];
  return caption ? `${cabecera}\n${caption}` : cabecera;
}

/** Tipos que no dicen nada: hay que completarlos mirando el nombre del archivo. */
const TIPOS_SIN_INFORMACION = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

const TIPO_POR_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
};

/** La extensión de un nombre o de una URL, en minúsculas y sin el punto. */
export function extensionDeArchivo(valor?: string | null): string {
  const limpio = (valor ?? '').trim().split('?')[0].split('#')[0].split('/').pop() ?? '';
  const punto = limpio.lastIndexOf('.');
  if (punto <= 0 || punto === limpio.length - 1) return '';
  return limpio.slice(punto + 1).toLowerCase();
}

/**
 * El id de WhatsApp de un mensaje, venga como venga.
 *
 * Waha lo entrega SERIALIZADO —`true_573001@c.us_3EB0A1B2`— y Evolution entrega
 * el mismo mensaje con el id pelado —`3EB0A1B2`—. Guardados los dos, la
 * conversación pintaba el mismo mensaje DOS VECES: para el desduplicado eran
 * ids distintos. Se ve al cambiar una línea de proveedor, cuando el historial
 * trae mensajes escritos con las dos formas.
 *
 * Solo se desarma la forma de Waha (`true_…_id` / `false_…_id`). Los ids de
 * Evolution, Meta y Telegram se devuelven intactos: un `wamid` de Meta puede
 * llevar guiones bajos dentro y recortarlo por ahí sí podría confundir dos
 * mensajes distintos.
 */
export function idDeWhatsapp(id?: string | null): string {
  const limpio = (id ?? '').trim();
  const serializado = /^(?:true|false)_.+_(.+)$/.exec(limpio);
  return serializado ? serializado[1] : limpio;
}

export function extractMediaInfo(msg: any, type: MediaType): MediaData | null {
  const typeKey = `${type}Message`;
  const mediaObj = msg?.[typeKey] || {};
  const url = msg?.mediaUrl || mediaObj.mediaUrl || mediaObj.url || mediaObj.directPath;
  // WhatsApp lo llama `fileName`; Waha, `filename`; y algunos envíos, `title`.
  const fileName: string =
    (mediaObj.fileName || mediaObj.filename || mediaObj.title || '').toString().trim();
  // Cuando el tipo no dice nada -Waha manda `application/octet-stream` cada vez
  // que no sabe qué le llega- se completa con la extensión del nombre, y si no
  // hay nombre, con la de la URL. Sin esto un PDF no se previsualizaba y la
  // burbuja salía rotulada con el propio mimetype.
  const declarado = (mediaObj.mimetype || '').toString().trim().toLowerCase();
  const mimeType = TIPOS_SIN_INFORMACION.has(declarado)
    ? TIPO_POR_EXTENSION[extensionDeArchivo(fileName) || extensionDeArchivo(url)] ??
      (declarado || 'application/octet-stream')
    : declarado;
  const caption = mediaObj.caption;
  if (url) {
    return {
      type,
      url,
      mimeType,
      caption: caption || undefined,
      fileName: fileName || undefined,
    };
  }
  return null;
}

/**
 * El texto que acompana a un adjunto, venga en el campo que venga.
 *
 * Se leia SOLO de `imageMessage.caption`, y no siempre viaja ahi: llega tambien
 * en `conversation` -asi lo manda Evolution en algunas versiones, y asi lo deja
 * el traductor de WhatsApp Mensajeria-. Resultado: alguien mandaba una foto con
 * texto, la foto se veia y **el texto no aparecia por ningun lado**. Comprobado
 * en produccion: el pie llegaba al servidor y se perdia al pintarlo.
 *
 * Se miran los dos, y el propio del tipo manda. Para un adjunto `conversation`
 * no suele existir, asi que este respaldo no le quita el sitio a nada.
 *
 * Salvo por una cosa: el servidor guarda una ETIQUETA -`[Imagen]`, `[Audio]`…-
 * como texto de la fila cuando el adjunto no trae pie, para que la lista de
 * chats tenga algo que resumir. Al leerla, `chat-persistence` la deja caer en
 * `conversation` si no habia texto, y este respaldo la pintaba como si fuera el
 * pie: una foto sin texto salia rotulada «[Imagen]» debajo. Son marcadores
 * nuestros, no lo que escribio nadie, asi que no valen como pie.
 */
const ETIQUETAS_DE_ADJUNTO = new Set([
  "[Imagen]",
  "[Video]",
  "[Audio]",
  "[Documento]",
  "[Sticker]",
]);

function pieDelAdjunto(media: MediaData | null, messageData: any): string {
  const propio = media?.caption?.trim();
  if (propio) return propio;
  const suelto = typeof messageData?.conversation === 'string' ? messageData.conversation.trim() : '';
  return ETIQUETAS_DE_ADJUNTO.has(suelto) ? "" : suelto;
}

function getInteractiveResponseText(messageData: Record<string, any>, isUser: boolean): string {
  const interactive = messageData?.interactiveResponseMessage;
  const bodyText = typeof interactive?.body?.text === 'string' ? interactive.body.text.trim() : '';
  const flowName = interactive?.nativeFlowResponseMessage?.name;

  if (flowName === 'call_permission_request') {
    if (bodyText.toLowerCase().includes('permitir')) {
      return isUser
        ? 'Permiso de llamada solicitado por WhatsApp'
        : 'Permiso de llamada aprobado por el cliente';
    }
    return bodyText || (isUser ? 'Solicitud de permiso de llamada enviada' : 'Permiso de llamada recibido');
  }

  return bodyText || 'Respuesta interactiva de WhatsApp';
}

/**
 * Teléfonos de una vCard.
 *
 * WhatsApp los escribe con prefijos y etiquetas —`item1.TEL;waid=584244319513:+58
 * 424-4319513`— y puede haber varios. Se prefiere el `waid`, que es el número tal
 * como WhatsApp lo identifica y por tanto el que sirve para escribirle; si no
 * está, se usa el valor visible, que es el que el contacto tenía guardado.
 */
function extraerTelefonosDeVcard(vcard: string): string[] {
  const telefonos: string[] = [];

  for (const linea of vcard.split(/\r?\n/)) {
    if (!/^item\d*\.?TEL|^TEL/i.test(linea.trim())) continue;

    const waid = /waid=(\d+)/i.exec(linea)?.[1];
    if (waid) {
      telefonos.push(`+${waid}`);
      continue;
    }

    const visible = linea.slice(linea.indexOf(':') + 1).trim();
    if (visible) telefonos.push(visible);
  }

  return Array.from(new Set(telefonos));
}

/**
 * Tarjeta de contacto legible: nombre y teléfono, en vez de "[Mensaje
 * contactMessage]".
 *
 * Se muestra tal cual como texto y no como una tarjeta con botones a propósito:
 * lo que hace falta es poder LEER y copiar el número sin salir de la App. Un
 * botón de "escribirle" abriría una conversación nueva desde una línea que puede
 * no ser la correcta, y eso ya dio problemas antes.
 *
 * Si la vCard no llegó (los adjuntos largos se recortan al guardarlos), queda al
 * menos el nombre, que es más que lo que había.
 */
/**
 * El texto de una plantilla de WhatsApp.
 *
 * Salía como "[Mensaje templateMessage]": el asesor abría el chat y no veía qué
 * se le había mandado al cliente, así que para saberlo tenía que ir al
 * administrador de plantillas de Meta y buscarla por nombre.
 *
 * El texto ya viene en el mensaje, pero cada canal lo pone en un sitio distinto:
 * WhatsApp lo trae "hidratado" —con las variables ya reemplazadas— en varias
 * formas según el tipo de plantilla, y Meta Cloud lo manda como texto plano. Se
 * miran todos y se usa el primero que traiga algo.
 *
 * Sin texto por ningún lado queda el nombre de la plantilla, que al menos
 * permite buscarla.
 */
/**
 * Busca un campo por nombre en cualquier nivel del payload.
 *
 * WhatsApp anida las plantillas de formas distintas segun por donde entren
 * (hydratedTemplate, hydratedFourRowTemplate, fourRowTemplate, y a veces una
 * capa mas). Mirar rutas fijas dejaba fuera variantes y el mensaje terminaba
 * como "Plantilla enviada", sin el texto. Buscar por nombre las cubre todas.
 */
function buscarCampoProfundo(objeto: any, nombres: string[], profundidad = 0): string {
  if (!objeto || typeof objeto !== 'object' || profundidad > 6) return '';
  for (const nombre of nombres) {
    const valor = objeto[nombre];
    if (typeof valor === 'string' && valor.trim()) return valor.trim();
  }
  for (const valor of Object.values(objeto)) {
    if (valor && typeof valor === 'object') {
      const encontrado = buscarCampoProfundo(valor, nombres, profundidad + 1);
      if (encontrado) return encontrado;
    }
  }
  return '';
}

/**
 * El texto de una sección (encabezado, cuerpo, pie) en cualquier nivel.
 *
 * Las plantillas nuevas de WhatsApp no usan los campos `hydrated…`: traen el
 * texto en `interactiveMessageTemplate.body.text`, un nivel más adentro y con
 * otro nombre. Sin mirar ahí, un mensaje de plantilla se leía como "Plantilla
 * enviada" y el asesor no veía lo que le habían escrito al cliente.
 */
function buscarTextoDeSeccion(objeto: any, seccion: string, profundidad = 0): string {
  if (!objeto || typeof objeto !== 'object' || profundidad > 6) return '';

  const directo = objeto[seccion];
  if (typeof directo === 'string' && directo.trim()) return directo.trim();
  if (directo && typeof directo === 'object') {
    const texto = directo.text ?? directo.title;
    if (typeof texto === 'string' && texto.trim()) return texto.trim();
  }

  for (const valor of Object.values(objeto)) {
    if (valor && typeof valor === 'object') {
      const encontrado = buscarTextoDeSeccion(valor, seccion, profundidad + 1);
      if (encontrado) return encontrado;
    }
  }
  return '';
}

function formatTemplateMessage(messageData: Record<string, any>): string {
  const plantilla = messageData?.templateMessage ?? messageData?.template ?? messageData ?? {};

  const partes = [
    buscarCampoProfundo(plantilla, ['hydratedTitleText', 'hydratedTitle'])
      || buscarTextoDeSeccion(plantilla, 'header'),
    buscarCampoProfundo(plantilla, ['hydratedContentText', 'hydratedContent'])
      || buscarTextoDeSeccion(plantilla, 'body'),
    buscarCampoProfundo(plantilla, ['hydratedFooterText', 'hydratedFooter'])
      || buscarTextoDeSeccion(plantilla, 'footer'),
  ]
    .map((t) => String(t ?? '').trim())
    .filter(Boolean);

  if (partes.length) return partes.join('\n\n');

  const suelto = [
    messageData?.conversation,
    messageData?.extendedTextMessage?.text,
    plantilla?.body,
    plantilla?.text,
  ]
    .map((t) => String(t ?? '').trim())
    .find(Boolean);
  if (suelto) return suelto;

  const nombre = String(plantilla?.name ?? '').trim();
  return nombre ? `📋 Plantilla: ${nombre}` : '📋 Plantilla enviada';
}

/**
 * Mensajes con botones o lista (los "interactivos" de WhatsApp) y las
 * respuestas del cliente a ellos.
 *
 * Salían como "[Mensaje interactiveMessage]": el asesor abría el chat y no veía
 * ni qué se preguntó ni qué opciones se ofrecieron. Se arma el texto real
 * (encabezado + cuerpo + pie) y se listan las opciones, que es lo que permite
 * entender la conversación sin abrir WhatsApp aparte.
 */
function formatInteractiveMessage(messageData: Record<string, any>): string {
  const limpiar = (t: unknown) => String(t ?? '').trim();

  // Etiquetas de los botones del formato nuevo (nativeFlowMessage). Cada botón
  // trae sus datos como JSON dentro de un string, con el nombre del campo
  // cambiando según el tipo (respuesta rápida, enlace, llamada...).
  const etiquetasDeFlujo = (flujo: any): string[] => {
    const botones = Array.isArray(flujo?.buttons) ? flujo.buttons : [];
    return botones
      .map((b: any) => {
        let params: Record<string, any> = {};
        try {
          params = typeof b?.buttonParamsJson === 'string' ? JSON.parse(b.buttonParamsJson) : (b?.buttonParamsJson ?? {});
        } catch {
          params = {};
        }
        const directa = limpiar(params.display_text || params.title || params.text);
        if (directa) return directa;
        // Listas: las opciones viven dentro de secciones.
        const secciones = Array.isArray(params.sections) ? params.sections : [];
        const filas = secciones.flatMap((sec: any) => (Array.isArray(sec?.rows) ? sec.rows : []));
        const titulos = filas.map((f: any) => limpiar(f?.title)).filter(Boolean);
        return titulos.join(' · ');
      })
      .filter(Boolean);
  };

  const tipo = messageData?.interactiveMessage
    ? 'interactive'
    : messageData?.buttonsMessage
      ? 'buttons'
      : messageData?.listMessage
        ? 'list'
        : messageData?.buttonsResponseMessage
          ? 'buttonsResponse'
          : messageData?.listResponseMessage
            ? 'listResponse'
            : 'desconocido';

  // Respuestas del cliente: lo que eligió.
  if (tipo === 'buttonsResponse') {
    const r = messageData.buttonsResponseMessage;
    return limpiar(r?.selectedDisplayText) || 'Opción seleccionada';
  }
  if (tipo === 'listResponse') {
    const r = messageData.listResponseMessage;
    return limpiar(r?.title) || limpiar(r?.description) || 'Opción seleccionada';
  }

  let partes: string[] = [];
  let opciones: string[] = [];

  if (tipo === 'interactive') {
    const i = messageData.interactiveMessage;
    partes = [i?.header?.title, i?.header?.subtitle, i?.body?.text, i?.footer?.text];
    opciones = etiquetasDeFlujo(i?.nativeFlowMessage);
    // Carrusel: cada tarjeta aporta su propio cuerpo y sus botones.
    const tarjetas = Array.isArray(i?.carouselMessage?.cards) ? i.carouselMessage.cards : [];
    for (const tarjeta of tarjetas) {
      partes.push(tarjeta?.body?.text);
      opciones.push(...etiquetasDeFlujo(tarjeta?.nativeFlowMessage));
    }
  } else if (tipo === 'buttons') {
    const b = messageData.buttonsMessage;
    partes = [b?.headerText ?? b?.text, b?.contentText, b?.footerText];
    const botones = Array.isArray(b?.buttons) ? b.buttons : [];
    opciones = botones.map((x: any) => limpiar(x?.buttonText?.displayText)).filter(Boolean);
  } else if (tipo === 'list') {
    const l = messageData.listMessage;
    partes = [l?.title, l?.description, l?.footerText];
    const secciones = Array.isArray(l?.sections) ? l.sections : [];
    const filas = secciones.flatMap((sec: any) => (Array.isArray(sec?.rows) ? sec.rows : []));
    opciones = filas.map((f: any) => limpiar(f?.title)).filter(Boolean);
  }

  const texto = partes.map(limpiar).filter(Boolean).join('\n\n');
  const listaOpciones = opciones.map(limpiar).filter(Boolean);

  if (texto && listaOpciones.length) return `${texto}\n\n🔘 ${listaOpciones.join(' · ')}`;
  if (texto) return texto;
  if (listaOpciones.length) return `🔘 ${listaOpciones.join(' · ')}`;
  return '🔘 Mensaje con botones';
}

function formatContactMessage(messageData: Record<string, any>): string {
  const contactos: Array<{ displayName?: string; vcard?: string }> =
    messageData?.contactsArrayMessage?.contacts ??
    (messageData?.contactMessage ? [messageData.contactMessage] : []);

  const lineas = contactos
    .map((contacto) => {
      const nombre = String(contacto?.displayName ?? '').trim();
      const telefonos = typeof contacto?.vcard === 'string'
        ? extraerTelefonosDeVcard(contacto.vcard)
        : [];

      if (nombre && telefonos.length) return `👤 ${nombre}\n${telefonos.join('\n')}`;
      if (nombre) return `👤 ${nombre}`;
      if (telefonos.length) return `👤 ${telefonos.join('\n')}`;
      return '';
    })
    .filter(Boolean);

  if (!lineas.length) return '👤 Contacto compartido';
  return lineas.join('\n\n');
}

function normalizeMessageLabel(text: string): string {
  const value = text.trim();
  const normalized = value.toLowerCase();
  if (
    normalized === '[lottiestickermessage]' ||
    normalized === 'lottiestickermessage' ||
    normalized === '[mensaje lottiestickermessage]'
  ) {
    return '🏷️ Sticker';
  }
  const labels: Record<string, string> = {
    '[imagen]': '🖼️ Imagen',
    'imagen': '🖼️ Imagen',
    '[video]': '🎥 Video',
    'video': '🎥 Video',
    '[audio]': '🎧 Audio',
    'audio': '🎧 Audio',
    '[nota de voz]': '🎙️ Nota de voz',
    'nota de voz': '🎙️ Nota de voz',
    '[documento]': '📄 Documento',
    'documento': '📄 Documento',
    '[sticker]': '🏷️ Sticker',
    'sticker': '🏷️ Sticker',
    '[media]': '📎 Archivo',
    'media': '📎 Archivo',
  };
  return labels[normalized] ?? value;
}

function isDeletedMessage(messageType: string | undefined, messageData: Record<string, any>): boolean {
  const protocolType = messageData?.protocolMessage?.type;
  return (
    messageType === 'protocolMessage' ||
    messageType === 'messageStubType' ||
    messageType === 'revokedMessage' ||
    protocolType === 0 ||
    protocolType === 'REVOKE' ||
    protocolType === 'MESSAGE_REVOKE'
  );
}

/**
 * Busca `contextInfo.externalAdReply` en cualquier parte de un `message`.
 *
 * Mira el propio objeto y cada uno de sus tipos (`imageMessage`,
 * `videoMessage`, `extendedTextMessage`, …). Es tolerante a propósito: si
 * WhatsApp añade un tipo nuevo, el anuncio se sigue encontrando.
 */
function buscarAnuncio(message: unknown): any {
  if (!message || typeof message !== "object") return undefined;
  const raiz = message as Record<string, any>;
  const propio = raiz.contextInfo?.externalAdReply;
  if (propio) return propio;
  for (const valor of Object.values(raiz)) {
    if (!valor || typeof valor !== "object") continue;
    const anuncio = (valor as Record<string, any>).contextInfo?.externalAdReply;
    if (anuncio) return anuncio;
  }
  return undefined;
}

export function resolveEvolutionMessageStatus(message: EvolutionMessage): string {
  // Lo que manda la pasarela de WhatsApp, que no siempre trae lo mismo: se
  // declara lo que se lee de ahi en vez de dejarlo sin forma.
  type ActualizacionDeMensaje = {
    status?: unknown;
    messageStatus?: unknown;
    update?: { status?: unknown; messageStatus?: unknown };
  };
  const updates: ActualizacionDeMensaje[] = Array.isArray(message.MessageUpdate)
    ? (message.MessageUpdate as ActualizacionDeMensaje[])
    : [];

  for (let i = updates.length - 1; i >= 0; i--) {
    const candidate = updates[i];
    const status =
      candidate?.status ||
      candidate?.messageStatus ||
      candidate?.update?.status ||
      candidate?.update?.messageStatus;

    if (typeof status === 'string' && status.trim()) {
      return status.trim();
    }
  }

  return message.status?.trim() || '';
}

export function normalizeDeliveryState(status?: string): MessageDeliveryState {
  const s = status?.trim().toUpperCase();

  if (!s || s === 'PENDING' || s === 'SENT') return 'sent';

  // Como WhatsApp: una palomita al llegar al servidor, dos al llegar al
  // telefono, azules al leerse. SERVER_ACK iba junto con "entregado" y las
  // dos primeras etapas se veian iguales.
  if (s === 'SERVER_ACK' || s === 'SENT') return 'sent';
  if (s === 'DELIVERY_ACK' || s === 'DELIVERED' || s === 'DEVICE_ACK') return 'delivered';

  if (s === 'READ' || s === 'READ_ACK' || s === 'PLAYED' || s === 'PLAYED_ACK') return 'read';

  if (s === 'ERROR' || s === 'FAILED' || s === 'FAIL') return 'failed';

  return 'sent';
}

/**
 * Quién escribió el mensaje, en los chats de GRUPO.
 *
 * En un grupo todos los mensajes entrantes llegan con el JID del grupo en
 * `remoteJid`, así que la burbuja no decía de cuál de los integrantes era: se
 * leía la conversación entera sin saber quién hablaba. WhatsApp manda al autor
 * aparte, en `key.participant`, y su nombre visible en `pushName`.
 *
 * El `@lid` es el identificador interno de WhatsApp y no sirve como teléfono; si
 * el número real viene en `participantAlt`, se usa ese.
 */
/**
 * El texto de un mensaje CITADO, en corto.
 *
 * La cita se pinta en una linea dentro de la burbuja, asi que no hace falta el
 * despliegue entero de tipos que hace la burbuja de verdad: basta el texto y,
 * si era un adjunto, decir cual. Lo que no se reconozca sale como «Mensaje»,
 * que es mejor que una cita en blanco.
 */
function textoDelMensajeCitado(citado: Record<string, any> | null | undefined): {
  content: string;
  mediaType?: string;
} {
  if (!citado || typeof citado !== 'object') return { content: 'Mensaje' };

  const texto =
    citado.conversation ||
    citado.extendedTextMessage?.text ||
    '';
  if (texto) return { content: normalizeMessageLabel(String(texto)) };

  const adjuntos: [string, string][] = [
    ['imageMessage', 'Imagen'],
    ['videoMessage', 'Video'],
    ['audioMessage', 'Audio'],
    ['documentMessage', 'Documento'],
    ['stickerMessage', 'Sticker'],
    ['locationMessage', 'Ubicacion'],
    ['contactMessage', 'Contacto'],
  ];
  for (const [clave, etiqueta] of adjuntos) {
    if (citado[clave]) {
      const pie = citado[clave]?.caption;
      return { content: pie ? normalizeMessageLabel(String(pie)) : '', mediaType: etiqueta };
    }
  }

  return { content: 'Mensaje' };
}

/**
 * A que mensaje responde este, si responde a alguno.
 *
 * WhatsApp lo manda en `contextInfo`: `stanzaId` es el id del citado y
 * `quotedMessage` su contenido. Los mensajes que salen del panel guardan lo
 * mismo (ver `persistOutgoingHistory`), asi que los dos caminos se leen igual.
 *
 * Si el mensaje citado esta cargado en la conversacion se prefiere SU texto y
 * SU autor: es el de verdad, y `contextInfo` a veces trae una version recortada.
 * Si no esta -una cita a algo muy viejo-, se usa lo que venga en el aviso.
 */
/**
 * El `contextInfo` de un mensaje, mire donde mire.
 *
 * No hay un solo sitio, y por eso mirar solo la raiz no bastaba:
 *
 * - Evolution/Baileys lo cuelgan DENTRO del tipo:
 *   `message.extendedTextMessage.contextInfo`.
 * - El normalizador de Waha lo escribe en `message.contextInfo`.
 * - Lo que sale del panel lo guarda en la raiz (ver `persistOutgoingHistory`).
 *
 * Se buscan los tres, que es la misma regla que ya sigue `buscarAnuncio` para
 * `externalAdReply`. Gana el primero que traiga de verdad un id citado: un
 * `contextInfo` sin cita -los hay, con `mentionedJid` y poco mas- no tapa al
 * que si la trae.
 */
function contextInfoConCita(m: EvolutionMessage): Record<string, any> | undefined {
  const message = (m.message ?? {}) as Record<string, any>;
  const candidatos: unknown[] = [m.contextInfo, message.contextInfo];
  for (const valor of Object.values(message)) {
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      candidatos.push((valor as Record<string, any>).contextInfo);
    }
  }

  for (const candidato of candidatos) {
    if (!candidato || typeof candidato !== 'object') continue;
    const ctx = candidato as Record<string, any>;
    if (ctx.stanzaId || ctx.quotedMessageId || ctx.quotedStanzaId) return ctx;
  }
  return undefined;
}

function citaDelMensaje(
  m: EvolutionMessage,
  porId: Map<string, { content: string; fromMe: boolean; mediaType?: string; author?: string }>,
): UIBubble['quotedMessage'] | undefined {
  const ctx = contextInfoConCita(m);
  if (!ctx) return undefined;

  const id = ctx.stanzaId || ctx.quotedMessageId || ctx.quotedStanzaId;
  if (!id || typeof id !== 'string') return undefined;

  const cargado = porId.get(id);
  if (cargado) {
    return {
      id,
      content: cargado.content,
      sender: cargado.fromMe ? 'user' : 'other',
      ...(cargado.mediaType ? { mediaType: cargado.mediaType } : {}),
      ...(cargado.author ? { author: cargado.author } : {}),
    };
  }

  const { content, mediaType } = textoDelMensajeCitado(ctx.quotedMessage);
  return {
    id,
    content,
    // Sin el mensaje delante no se puede saber de quien era con certeza. Se
    // dice «Contacto», que es lo que mas veces acierta: casi siempre se cita
    // al cliente.
    sender: 'other',
    ...(mediaType ? { mediaType } : {}),
  };
}

function autorDeMensajeDeGrupo(m: EvolutionMessage): { name: string | null; phone: string | null } {
  const jidCrudo = m.key?.participant || m.participant || '';
  const jidAlterno = m.key?.participantAlt || '';
  const jid = /@lid$/i.test(jidCrudo) && jidAlterno ? jidAlterno : jidCrudo;

  const digitos = jid.split('@')[0]?.replace(/\D/g, '') ?? '';
  const phone = /@lid$/i.test(jid) || !digitos ? null : digitos;

  const nombre = (m.pushName ?? '').trim();

  return { name: nombre || null, phone };
}

/** Convierte EvolutionMessage[] → UIBubble[] inyectando base64 del caché si existe */
export function toUIMessages(
  messages: EvolutionMessage[],
  avatarUrl: string | undefined,
  base64Map: Map<string, { dataUrl: string; mime: string; length: number }>,
): UIBubble[] {
  // Reacciones: emoji pegado al mensaje objetivo (estilo WhatsApp). Última gana;
  // text vacío = reacción removida.
  const reactions = new Map<string, string>();

  const bubbles = messages.map((m): UIBubble | null => {
    const isUser = m.key?.fromMe === true;
    const sender: 'user' | 'other' = isUser ? 'user' : 'other';
    const esGrupo = /@g\.us$/i.test(m.key?.remoteJid ?? '');
    const autor = !isUser && esGrupo ? autorDeMensajeDeGrupo(m) : null;
    const ts = m.messageTimestamp;
    let content = '';
    let media: MediaData | null = null;
    let kind: UIBubble['kind'];
    let call: UIBubble['call'];
    const messageData = (m.message || {}) as import('@/actions/chat-actions').MessageContent;

    // Las reacciones NO son una burbuja propia: se adjuntan a su mensaje objetivo.
    if (m.messageType === 'reactionMessage') {
      const rm = (messageData as Record<string, any>).reactionMessage;
      const targetId: string | undefined = rm?.key?.id;
      if (targetId) reactions.set(targetId, (rm?.text as string) ?? '');
      return null;
    }

    // Sobres internos (la edición de un mensaje, el voto de una encuesta): sin
    // burbuja. No llevan texto legible y salían como "[Mensaje
    // secretEncryptedMessage]" debajo del mensaje que se editó.
    if (esSobreInternoDeWhatsapp(m.messageType)) return null;

    if (isDeletedMessage(m.messageType, messageData as Record<string, any>)) {
      content = 'Mensaje eliminado';
    } else {
      switch (m.messageType) {
      case 'conversation':
        content = messageData?.conversation ? normalizeMessageLabel(messageData.conversation) : '';
        break;
      case 'extendedTextMessage':
        content = messageData?.extendedTextMessage?.text
          ? normalizeMessageLabel(messageData.extendedTextMessage.text)
          : '';
        break;
      // Un mensaje con adjunto SIEMPRE dice algo. Si el archivo no esta -no se
      // pudo guardar, o llego antes de que se guardara- la burbuja salia
      // completamente VACIA: ni archivo, ni texto, ni aviso. Desde fuera parece
      // que el mensaje no llego, y el unico rastro era la hora suelta.
      case 'imageMessage':
        media = extractMediaInfo(messageData, 'image');
        content = pieDelAdjunto(media, messageData) || (media ? '' : etiquetaDeAdjuntoSinArchivo('image', messageData));
        break;
      case 'videoMessage':
        media = extractMediaInfo(messageData, 'video');
        content = pieDelAdjunto(media, messageData) || (media ? '' : etiquetaDeAdjuntoSinArchivo('video', messageData));
        break;
      case 'audioMessage':
        media = extractMediaInfo(messageData, 'audio');
        content = media ? '' : etiquetaDeAdjuntoSinArchivo('audio', messageData);
        break;
      case 'documentMessage':
        media = extractMediaInfo(messageData, 'document');
        content = pieDelAdjunto(media, messageData) || (media ? '' : etiquetaDeAdjuntoSinArchivo('document', messageData));
        break;
      case 'interactiveResponseMessage':
        content = getInteractiveResponseText(messageData as Record<string, any>, isUser);
        break;
      case 'interactiveMessage':
      case 'buttonsMessage':
      case 'listMessage':
      case 'buttonsResponseMessage':
      case 'listResponseMessage':
        content = formatInteractiveMessage(messageData as Record<string, any>);
        break;
      // Tarjetas de contacto. Salían como "[Mensaje contactMessage]", que no dice
      // ni quién es ni su teléfono: para usarlo había que abrir WhatsApp aparte.
      case 'contactMessage':
      case 'contactsArrayMessage':
        content = formatContactMessage(messageData as Record<string, any>);
        break;
      // El cliente toco un boton de una plantilla. Salia como
      // "[Mensaje templateButtonReplyMessage]": no se veia que eligio.
      case 'templateButtonReplyMessage': {
        const r = (messageData as Record<string, any>).templateButtonReplyMessage ?? {};
        content = String(r.selectedDisplayText ?? r.selectedId ?? '').trim() || 'Opción seleccionada';
        break;
      }
      case 'templateMessage':
      case 'template':
        content = formatTemplateMessage(messageData as Record<string, any>);
        break;
      case 'stickerMessage':
      case 'lottieStickerMessage': {
        const raw = messageData as Record<string, any>;
        const s = raw.stickerMessage || raw.lottieStickerMessage || {};
        const url = messageData.mediaUrl || s.mediaUrl || s.url || s.directPath;
        if (url) media = { type: 'image', url, mimeType: s.mimetype || 'image/webp' };
        kind = 'sticker';
        break;
      }
      case 'call': {
        kind = 'call';
        const callRaw = ((messageData as Record<string, any>).call ?? {}) as {
          direction?: 'incoming' | 'outgoing';
          isVideo?: boolean;
          durationSecs?: number;
          status?: string;
        };
        call = {
          direction: callRaw.direction ?? 'incoming',
          isVideo: !!callRaw.isVideo,
          durationSecs: callRaw.durationSecs ?? 0,
          status: callRaw.status,
        };
        content = messageData?.conversation || (call.isVideo ? 'Videollamada' : 'Llamada');
        break;
      }
      case 'meta_call': {
        kind = 'call';
        const metaCall = ((messageData as Record<string, any>).metaCall ?? {}) as {
          direction?: string;
          status?: string;
          duration?: number | string;
        };
        const durationSecs = Number(metaCall.duration ?? 0) || 0;
        call = {
          direction: metaCall.direction === 'BUSINESS_INITIATED' ? 'outgoing' : 'incoming',
          isVideo: false,
          durationSecs,
          status: metaCall.status,
        };
        content = 'Llamada de WhatsApp';
        break;
      }
      default:
        content = `[Mensaje ${m.messageType || 'desconocido'}]`;
      }
    }

    // Un mensaje de TEXTO que quedó SIN contenido (un "stub" vacío) casi siempre
    // es un mensaje que el CLIENTE eliminó y que WhatsApp/Evolution devuelve vacío
    // al recargar el historial (sin el evento de borrado). En vez de una burbuja
    // en blanco, lo mostramos como "Mensaje eliminado" con badge.
    //
    // IMPORTANTE: se ACOTA a tipos de texto (o desconocido). Un mensaje de media
    // (audio/imagen/video/documento) puede llegar SIN url porque Evolution todavía
    // no terminó de procesarlo: en ese caso NO está eliminado, solo está cargando,
    // y marcarlo como "eliminado" hacía que el mensaje "no se viera" hasta que
    // terminaba de sincronizar (varios minutos después).
    const textLikeTypes = new Set(['conversation', 'extendedTextMessage']);
    const isTextLike = !m.messageType || textLikeTypes.has(m.messageType);
    const isEmptyDeletedStub = !content && !media && !kind && !call && isTextLike;
    if (isEmptyDeletedStub) {
      content = 'Mensaje eliminado';
    }

    // Inyección de base64 desde caché
    const msgId = m.key?.id || m.id;
    if (msgId && base64Map.has(msgId) && media) {
      const cached = base64Map.get(msgId)!;
      media = { ...media, url: cached.dataUrl, mimeType: cached.mime };
    }

    // Extraer previsualización de anuncio Click-to-WhatsApp.
    //
    // El anuncio viaja en `contextInfo.externalAdReply`, y ese `contextInfo`
    // cuelga DEL TIPO DE MENSAJE, no del mensaje. Se miraban solo tres sitios
    // —el mensaje, `extendedTextMessage` y el nivel de arriba—, así que un
    // anuncio que llega como imagen o vídeo (que es lo normal cuando el anuncio
    // LLEVA imagen) se quedaba sin previsualización: ni la foto, ni el título,
    // ni el enlace.
    //
    // Y no vale con añadir `imageMessage` y `videoMessage` a mano: WhatsApp
    // tiene más tipos (`documentMessage`, `viewOnceMessage`…) y cada uno lo
    // cuelga de su propio `contextInfo`. Se buscan TODOS, que es la misma regla
    // que rige el resto de la pantalla con las identidades del contacto:
    // preguntar por una sola forma devuelve vacío sin error.
    const adReply = buscarAnuncio(messageData) ?? (m.contextInfo as any)?.externalAdReply;
    const rawThumb = adReply?.mediaUrl || adReply?.thumbnail;
    const thumbnailUrl = rawThumb
      ? rawThumb.startsWith('data:') || rawThumb.startsWith('http')
        ? rawThumb
        : `data:image/jpeg;base64,${rawThumb}`
      : undefined;
    const adPreview: UIBubble['adPreview'] = adReply
      ? { title: adReply.title, body: adReply.body, sourceUrl: adReply.sourceUrl, thumbnailUrl }
      : undefined;

    return {
      id: m.key?.id || m.id || (ts ? String(ts) : '') + Math.random().toString(36).slice(2),
      sender,
      content,
      avatarSrc: sender === 'user' ? '/placeholder.svg' : avatarUrl,
      // Multiplicar por 1000 daba por hecho que la marca venia en segundos, y no
      // siempre: cuando Evolution la manda en milisegundos, esto la convertia en
      // una fecha del ano 56000. La burbuja se pintaba bajo un separador de
      // fecha absurdo, lejos de donde el asesor la buscaba, y parecia que el
      // mensaje no habia llegado. `epochToMs` acepta las dos unidades.
      ts: epochToMs(ts) || undefined,
      media: media || undefined,
      status: isUser ? normalizeDeliveryState(resolveEvolutionMessageStatus(m)) : undefined,
      kind,
      call,
      adPreview,
      ...(autor && (autor.name || autor.phone)
        ? { groupSenderName: autor.name, groupSenderPhone: autor.phone }
        : {}),
      // Marca persistida por el backend (respuesta del agente / nodo de flujo).
      // El emparejamiento por texto de chat-main puede sumar más, pero nunca la quita.
      ...((m as any).sentByAi === true ? { sentByAi: true } : {}),
      // El cliente eliminó este mensaje ("eliminar para todos"); lo conservamos y
      // el panel muestra el badge "Eliminado". También cuando llega como stub vacío.
      ...(m.clientDeleted === true || isEmptyDeletedStub ? { clientDeleted: true } : {}),
    };
  });

  const result = bubbles.filter((b): b is UIBubble => b !== null);

  // La cita: a qué mensaje responde cada uno.
  //
  // Va aquí, después de armar las burbujas, porque para pintar bien la cita
  // hace falta el texto del mensaje citado, y ese solo se conoce cuando ya
  // están todas montadas. Antes no se rellenaba en ningún sitio: la burbuja
  // sabía pintarla —el bloque existe en `MessageBubble`— pero nunca le llegaba,
  // así que respondías citando, en WhatsApp se veía la cita y en el panel la
  // respuesta salía suelta, sin decir a qué contestaba.
  const porId = new Map<string, { content: string; fromMe: boolean; mediaType?: string; author?: string }>();
  for (const b of result) {
    porId.set(b.id, {
      content: b.content,
      fromMe: b.sender === 'user',
      ...(b.media?.type ? { mediaType: b.media.type } : {}),
      // En un grupo escriben varios: quién lo dijo forma parte de la cita. En
      // un chat de uno a uno no hace falta, que es el de la cabecera.
      ...(b.groupSenderName ? { author: b.groupSenderName } : {}),
    });
  }
  // Por id, no por posicion: la lista de burbujas es la de mensajes FILTRADA
  // -los sobres internos y los eliminados no pintan-, asi que los indices no se
  // corresponden.
  const mensajePorId = new Map<string, EvolutionMessage>();
  for (const m of messages) {
    const id = m.key?.id;
    if (id) mensajePorId.set(id, m);
  }
  for (const b of result) {
    const m = mensajePorId.get(b.id);
    if (!m) continue;
    const cita = citaDelMensaje(m, porId);
    if (cita) b.quotedMessage = cita;
  }

  // Adjunta cada reacción a su mensaje objetivo (si está cargado en la lista).
  if (reactions.size) {
    for (const b of result) {
      const emoji = reactions.get(b.id);
      if (emoji) b.reaction = emoji;
    }
  }
  // Y la que viene colgada del propio mensaje, que es como la guarda nuestra
  // base (ver `guardarReaccion`). Sin esto, en las líneas que leen la
  // conversación de nuestra base —Waha, y cualquiera cuando Evolution no
  // contesta— se reaccionaba, se veía en el teléfono y en el panel no quedaba
  // nada. Va después porque es la que sobrevive a la recarga.
  const porMensaje = new Map<string, string>();
  for (const m of messages) {
    const emoji = (m as { reaccion?: unknown }).reaccion;
    if (typeof emoji === 'string' && emoji) porMensaje.set(m.key?.id ?? '', emoji);
  }
  if (porMensaje.size) {
    for (const b of result) {
      const emoji = porMensaje.get(b.id);
      if (emoji) b.reaction = emoji;
    }
  }
  return result;
}

// Re-export cn for convenience in chat components
export { cn };
