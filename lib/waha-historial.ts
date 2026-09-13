import type { MensajeDeWaha } from '@/lib/waha';

/**
 * Un mensaje de Waha, traducido a lo que guarda nuestra base.
 *
 * Es la MISMA forma que escribe el envio desde el panel (`snapshotDeSaliente`)
 * y la misma que el backend deja al recibir por webhook: `key`, `message`,
 * `messageTimestamp` en SEGUNDOS y, si contesta a otro, `contextInfo`. Guardar
 * el historial con otra forma seria peor que no traerlo: la burbuja lee por
 * tipo, y un objeto cualquiera se cuela entero dentro de `message`.
 *
 * Puro a proposito: entra lo que devuelve Waha y sale lo que se guarda, sin
 * tocar la red ni la base. Asi se puede probar con payloads de verdad.
 */

export type MensajeParaGuardar = {
  messageId: string;
  fromMe: boolean;
  messageType: string;
  content: string | null;
  mediaUrl: string | null;
  messageTimestamp: Date;
  raw: Record<string, unknown>;
};

/** El tipo de burbuja que le toca a un adjunto, por su mimetype. */
function tipoPorMimetype(mimetype: string): string {
  if (mimetype.startsWith('image/')) return 'imageMessage';
  if (mimetype.startsWith('audio/')) return 'audioMessage';
  if (mimetype.startsWith('video/')) return 'videoMessage';
  return 'documentMessage';
}

/** Lo que se enseña de un adjunto que llega sin archivo. */
function etiquetaDelTipo(tipo: string): string {
  if (tipo === 'imageMessage') return '[Imagen]';
  if (tipo === 'audioMessage') return '[Audio]';
  if (tipo === 'videoMessage') return '[Video]';
  return '[Documento]';
}

/** El id del mensaje al que contesta, venga como venga. */
function citaDelMensajeDeWaha(m: MensajeDeWaha): { stanzaId: string; texto: string } | null {
  const replyTo: any = m.replyTo;
  if (typeof replyTo === 'string' && replyTo.trim()) return { stanzaId: replyTo.trim(), texto: '' };
  if (replyTo && typeof replyTo === 'object') {
    const id = replyTo.id ?? replyTo.Id ?? replyTo.ID;
    if (typeof id === 'string' && id.trim()) {
      const texto = typeof replyTo.body === 'string' ? replyTo.body : '';
      return { stanzaId: id.trim(), texto };
    }
  }
  return null;
}

/**
 * Las marcas de Waha vienen en SEGUNDOS, pero no siempre: algunos motores las
 * dan en milisegundos. Se normaliza, que es la regla de toda la App.
 */
function fechaDelMensaje(timestamp: unknown): Date | null {
  const n = Number(timestamp);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const fecha = new Date(ms);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function mensajeDeWahaParaGuardar(
  m: MensajeDeWaha,
  remoteJid: string,
): MensajeParaGuardar | null {
  const messageId = typeof m.id === 'string' ? m.id.trim() : '';
  if (!messageId) return null;

  const fecha = fechaDelMensaje(m.timestamp);
  if (!fecha) return null;

  const fromMe = m.fromMe === true;
  const texto = typeof m.body === 'string' ? m.body : '';

  let messageType = 'conversation';
  let content: string | null = texto || null;
  const message: Record<string, unknown> = {};

  if (m.hasMedia) {
    const mimetype = m.media?.mimetype ?? '';
    messageType = tipoPorMimetype(mimetype);
    // El archivo NO se trae: pedirselo a Waha obliga a descargarlo y volverlo a
    // subir, y eso no se hace mil veces seguidas al importar. Lo que llegue por
    // el webhook de aqui en adelante SI trae su archivo; esto es historial, y
    // vale con saber que hubo una foto y con su pie.
    content = texto || etiquetaDelTipo(messageType);
    message[messageType] = {
      ...(mimetype ? { mimetype } : {}),
      ...(texto ? { caption: texto } : {}),
      ...(m.media?.filename ? { fileName: m.media.filename } : {}),
    };
  }

  if (content) message.conversation = content;

  const cita = citaDelMensajeDeWaha(m);

  return {
    messageId,
    fromMe,
    messageType,
    content,
    mediaUrl: null,
    messageTimestamp: fecha,
    raw: {
      key: { id: messageId, fromMe, remoteJid },
      messageType,
      message,
      messageTimestamp: Math.floor(fecha.getTime() / 1000),
      status: fromMe ? 'DELIVERY_ACK' : undefined,
      source: 'waha',
      origen: 'waha-historial',
      ...(cita
        ? {
            contextInfo: {
              stanzaId: cita.stanzaId,
              ...(cita.texto ? { quotedMessage: { conversation: cita.texto } } : {}),
            },
          }
        : {}),
    },
  };
}
