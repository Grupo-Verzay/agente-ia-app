/**
 * Cómo se lee una fila de `chat_messages` (messageType `call`) como una llamada
 * de CRM › Llamadas.
 *
 * Una sola función para la lista (`getCallsCrmData`) y para el detalle que se
 * pide al abrir el diálogo (`getCallDetailAction`): con dos lectores, el
 * diálogo y la tabla podrían enseñar cosas distintas de la misma llamada, que
 * es la familia de «dos fórmulas para la misma pantalla».
 *
 * Pura (sin base) para que el banco la ejerza.
 */
import {
  laMarcaDeLaLlamada,
  type MotivoDeLaLlamada,
} from '@/lib/transcripcion-de-la-llamada';

export type CallDirection = 'incoming' | 'outgoing';

export interface CallRow {
  id: string;
  direction: CallDirection;
  phone: string;
  contactName: string | null;
  durationSecs: number;
  status: string;
  disposition: string | null;
  /** Quién puso el resultado: la IA al procesar la grabación, o una persona. */
  dispositionSource: 'ia' | 'manual' | null;
  /** Lo que propuso la IA, aunque alguien lo haya cambiado después. */
  dispositionIa: string | null;
  hasRecording: boolean;
  recordingUrl: string | null;
  transcript: string | null;
  summary: string | null;
  astraSid: string | null;
  astraCallId: string | null;
  /**
   * Por qué esta llamada se quedó sin transcripción, si es que se quedó.
   *
   * Sin esto la tarjeta solo podía deducir «hay grabación y no hay texto» y
   * pintaba **«Procesando…» para siempre**, también cuando el proceso ya había
   * abandonado hacía media hora. Un estado que no se puede distinguir de otro
   * no se puede enseñar: por eso el motivo viaja hasta aquí.
   */
  transcripcionMotivo: MotivoDeLaLlamada | null;
  /** Los números del aviso de créditos, que van con él o no dice nada útil. */
  transcripcionHacenFalta: number | null;
  transcripcionQuedan: number | null;
  ts: number; // epoch ms
  /**
   * La cuenta bajo la que esta guardada la llamada.
   *
   * Baja siempre, unificado o no: la insignia se decide al pintar con
   * `elCrmVaUnificado`, y el gate de «esta fila es de otra cuenta» necesita el
   * dueno — **sin dueno no es ajena**.
   */
  cuentaId: string;
  /**
   * La linea por la que se hizo. Volver a llamar desde esta fila tiene que
   * salir por ESA linea (y con el numero de su cuenta), no por la de quien mira.
   */
  instanceName: string | null;
}

export interface FilaCrudaDeLlamada {
  id: unknown;
  userId: string;
  instanceName: string | null;
  remoteJid: string;
  fromMe: boolean;
  raw: unknown;
  messageTimestamp: Date | string;
  pushName: string | null;
}

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return v.trim() ? v : null;
}

export function elCallRowDesdeLaFila(r: FilaCrudaDeLlamada): CallRow {
  const rawObj = r.raw && typeof r.raw === 'object' ? (r.raw as Record<string, any>) : {};
  const callRaw = (rawObj.call && typeof rawObj.call === 'object' ? rawObj.call : {}) as Record<string, unknown>;
  const direction: CallDirection =
    callRaw.direction === 'outgoing' ? 'outgoing'
    : callRaw.direction === 'incoming' ? 'incoming'
    : (r.fromMe ? 'outgoing' : 'incoming');
  const phone = (r.remoteJid || '').split('@')[0].split(':')[0];
  const fuente = callRaw.dispositionSource;
  const marca = laMarcaDeLaLlamada(callRaw.transcripcion);
  return {
    id: String(r.id),
    direction,
    phone,
    contactName: r.pushName ?? null,
    durationSecs: Number(callRaw.durationSecs ?? 0) || 0,
    status: String(callRaw.status ?? ''),
    disposition: texto(callRaw.disposition),
    dispositionSource: fuente === 'ia' || fuente === 'manual' ? fuente : null,
    dispositionIa: texto(callRaw.dispositionIa),
    hasRecording: Boolean(callRaw.hasRecording),
    recordingUrl: texto(callRaw.recordingUrl),
    transcript: texto(callRaw.transcript),
    summary: texto(callRaw.summary),
    astraSid: texto(callRaw.astraSid),
    astraCallId: texto(callRaw.astraCallId),
    transcripcionMotivo: marca?.motivo ?? null,
    transcripcionHacenFalta: marca?.hacenFalta ?? null,
    transcripcionQuedan: marca?.quedan ?? null,
    ts: new Date(r.messageTimestamp).getTime(),
    cuentaId: r.userId,
    instanceName: r.instanceName ?? null,
  };
}
