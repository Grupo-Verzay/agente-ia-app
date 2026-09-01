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

export function extractMediaInfo(msg: any, type: MediaType): MediaData | null {
  const typeKey = `${type}Message`;
  const mediaObj = msg?.[typeKey] || {};
  const url = msg?.mediaUrl || mediaObj.mediaUrl || mediaObj.url || mediaObj.directPath;
  const mimeType = mediaObj.mimetype || 'application/octet-stream';
  const caption = mediaObj.caption;
  if (url) return { type, url, mimeType, caption: caption || undefined };
  return null;
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

  if (s === 'SERVER_ACK' || s === 'DELIVERY_ACK' || s === 'DELIVERED' || s === 'DEVICE_ACK') return 'delivered';

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
      case 'imageMessage':
        media = extractMediaInfo(messageData, 'image');
        content = media?.caption || '';
        break;
      case 'videoMessage':
        media = extractMediaInfo(messageData, 'video');
        content = media?.caption || '';
        break;
      case 'audioMessage':
        media = extractMediaInfo(messageData, 'audio');
        content = '';
        break;
      case 'documentMessage':
        media = extractMediaInfo(messageData, 'document');
        content = media?.caption || '';
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

    // Extraer previsualización de anuncio Click-to-WhatsApp
    const adReply =
      messageData?.contextInfo?.externalAdReply ??
      messageData?.extendedTextMessage?.contextInfo?.externalAdReply ??
      (m.contextInfo as any)?.externalAdReply;
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
  // Adjunta cada reacción a su mensaje objetivo (si está cargado en la lista).
  if (reactions.size) {
    for (const b of result) {
      const emoji = reactions.get(b.id);
      if (emoji) b.reaction = emoji;
    }
  }
  return result;
}

// Re-export cn for convenience in chat components
export { cn };
