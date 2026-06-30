// Canales de entrenamiento del Agente IA. Una sola ruta /ia con tabs arriba para
// cambiar de canal. WhatsApp Mensajería (QR) es la BASE; los demás canales pueden
// tener su propio entrenamiento (parten de una copia de la base). 'llamadas' es el
// agente de voz (usa Instancia.voicebotPrompt, no un AgentPrompt).
export interface TrainingChannel {
  slug: string;
  label: string;
  agentId: string | null; // null = canal de voz (no usa AgentPrompt)
  kind: 'chat' | 'voice';
}

// Los labels son IDÉNTICOS a los nombres de las tarjetas en Conexión.
export const TRAINING_CHANNELS: TrainingChannel[] = [
  { slug: 'whatsapp', label: 'Mensajería WhatsApp', agentId: 'system-prompt-ai', kind: 'chat' },
  { slug: 'llamadas', label: 'Llamadas WhatsApp', agentId: null, kind: 'voice' },
  { slug: 'whatsapp-api', label: 'WhatsApp Cloud API', agentId: 'system-prompt-ai-whatsapp-cloud', kind: 'chat' },
  { slug: 'telegram', label: 'Mensajería Telegram', agentId: 'system-prompt-ai-telegram', kind: 'chat' },
  { slug: 'facebook', label: 'Mensajería Facebook', agentId: 'system-prompt-ai-facebook', kind: 'chat' },
  { slug: 'instagram', label: 'Mensajería Instagram', agentId: 'system-prompt-ai-instagram', kind: 'chat' },
];

export const DEFAULT_TRAINING_CHANNEL = 'whatsapp';
export const BASE_TRAINING_AGENT_ID = 'system-prompt-ai';

export function getTrainingChannel(slug: string): TrainingChannel | undefined {
  return TRAINING_CHANNELS.find((c) => c.slug === slug);
}
