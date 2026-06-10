export const TYPE_AI_LABELS = {
  business: "Perfil",
  training: "Inicio",
  faq: "Preguntas",
  products: "Productos",
  more: "Extras",
  keywords: "Palabras clave",
  management: "Gestion",
} as const;

export type AiSectionKey = keyof typeof TYPE_AI_LABELS;
