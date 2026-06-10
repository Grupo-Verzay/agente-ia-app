export const TYPE_AI_LABELS = {
  business: "Perfil",
  training: "Inicio",
  faq: "Preguntas",
  products: "Productos",
  more: "Extras",
  management: "Gestion",
  keywords: "Palabras clave",
} as const;

export type AiSectionKey = keyof typeof TYPE_AI_LABELS;
