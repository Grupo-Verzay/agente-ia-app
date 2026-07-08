// Canales de entrenamiento del Agente IA. Una sola ruta /ia con tabs arriba para
// cambiar de canal. WhatsApp Mensajería (QR) es la BASE; los demás canales pueden
// tener su propio entrenamiento (parten de una copia de la base). 'llamadas' es el
// agente de voz (usa Instancia.voicebotPrompt, no un AgentPrompt).
// Flag booleano en User que habilita cada canal (los define el plan/administrador).
export type ChannelEnableFlag =
  | 'onCalls'
  | 'onWhatsappCloud'
  | 'onTelegram'
  | 'onFacebook'
  | 'onInstagram';

export interface TrainingChannel {
  slug: string;
  label: string;
  agentId: string | null; // null = canal de voz (no usa AgentPrompt)
  kind: 'chat' | 'voice';
  // Flag de User que habilita el canal. Ausente = canal base (WhatsApp QR), que
  // siempre está disponible.
  enableFlag?: ChannelEnableFlag;
}

// Labels cortos (el icono de marca identifica el canal). El slug mapea al canal
// real; el detalle largo se ve en Conexión.
export const TRAINING_CHANNELS: TrainingChannel[] = [
  { slug: 'whatsapp', label: 'WhatsApp', agentId: 'system-prompt-ai', kind: 'chat' },
  { slug: 'llamadas', label: 'Llamadas', agentId: 'system-prompt-ai-llamadas', kind: 'chat', enableFlag: 'onCalls' },
  { slug: 'whatsapp-api', label: 'WhatsApp API', agentId: 'system-prompt-ai-whatsapp-cloud', kind: 'chat', enableFlag: 'onWhatsappCloud' },
  { slug: 'telegram', label: 'Telegram', agentId: 'system-prompt-ai-telegram', kind: 'chat', enableFlag: 'onTelegram' },
  { slug: 'facebook', label: 'Facebook', agentId: 'system-prompt-ai-facebook', kind: 'chat', enableFlag: 'onFacebook' },
  { slug: 'instagram', label: 'Instagram', agentId: 'system-prompt-ai-instagram', kind: 'chat', enableFlag: 'onInstagram' },
];

export const DEFAULT_TRAINING_CHANNEL = 'whatsapp';
export const BASE_TRAINING_AGENT_ID = 'system-prompt-ai';

export function getTrainingChannel(slug: string): TrainingChannel | undefined {
  return TRAINING_CHANNELS.find((c) => c.slug === slug);
}

export type ChannelFlags = Partial<Record<ChannelEnableFlag, boolean>>;

/** ¿El usuario tiene habilitado este canal? WhatsApp base siempre true. */
export function isChannelEnabled(channel: TrainingChannel, flags: ChannelFlags): boolean {
  if (!channel.enableFlag) return true;
  return !!flags[channel.enableFlag];
}
