// Voces disponibles de OpenAI Realtime (las más naturales). En un archivo aparte
// (no 'use server') porque los módulos 'use server' solo pueden exportar funciones.
export const VOICEBOT_VOICES = ['alloy', 'verse', 'shimmer', 'coral', 'sage', 'ash'] as const;

export type VoicebotVoice = (typeof VOICEBOT_VOICES)[number];
