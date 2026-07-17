// Voces disponibles de OpenAI Realtime (las más naturales). En un archivo aparte
// (no 'use server') porque los módulos 'use server' solo pueden exportar funciones.
export const VOICEBOT_VOICES = ['marin', 'cedar', 'coral', 'sage', 'verse', 'alloy', 'shimmer', 'ash'] as const;

export type VoicebotVoice = (typeof VOICEBOT_VOICES)[number];

// Voz por defecto: la más natural/humana del modelo `gpt-realtime`. Se usa cuando
// la cuenta aún no ha elegido una (evita caer en 'alloy', que suena más robótica).
export const DEFAULT_VOICEBOT_VOICE: VoicebotVoice = 'marin';

export interface VoicebotVoiceOption {
  id: VoicebotVoice;
  label: string;
  gender: 'F' | 'M' | 'N'; // femenina / masculina / neutra
  hint: string;
  recommended?: boolean;
}

// Catálogo para el selector: las más realistas primero. `marin` y `cedar` son las
// voces nuevas exclusivas de `gpt-realtime`, las más expresivas y naturales.
export const VOICEBOT_VOICE_OPTIONS: VoicebotVoiceOption[] = [
  { id: 'marin', label: 'Marin', gender: 'F', hint: 'La más natural y expresiva', recommended: true },
  { id: 'cedar', label: 'Cedar', gender: 'M', hint: 'La más natural y expresiva', recommended: true },
  { id: 'coral', label: 'Coral', gender: 'F', hint: 'Cálida y cercana' },
  { id: 'verse', label: 'Verse', gender: 'M', hint: 'Enérgica y conversacional' },
  { id: 'sage', label: 'Sage', gender: 'F', hint: 'Serena y clara' },
  { id: 'ash', label: 'Ash', gender: 'M', hint: 'Firme y profesional' },
  { id: 'shimmer', label: 'Shimmer', gender: 'F', hint: 'Suave y amable' },
  { id: 'alloy', label: 'Alloy', gender: 'N', hint: 'Neutra (clásica)' },
];
