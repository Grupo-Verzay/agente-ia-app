/**
 * Cómo se llama cada pestaña del editor del Agente IA, y lo que dice cada una
 * por dentro. Es la ÚNICA fuente: la barra de pestañas pinta estos nombres y
 * la tarjeta de cada pestaña los usa como título, así que la pestaña «Inicio»
 * no puede abrir una tarjeta que diga «Entrenamiento» ni la de «Perfil» una
 * que diga «Información del Negocio» —que es como estaban, y cada pestaña se
 * leía como una pantalla distinta—.
 *
 * Lo prueba `lib/__tests__/pestanas-del-agente.test.mjs`, que lee los
 * componentes y falla si una tarjeta vuelve a escribir su título, su botón o
 * su mensaje vacío a mano.
 */
export const TYPE_AI_LABELS = {
  business: "Perfil",
  training: "Inicio",
  faq: "Preguntas",
  products: "Productos",
  more: "Extras",
  keywords: "Palabras clave",
  management: "Gestión",
  quotes: "Cotizaciones",
} as const;

export type AiSectionKey = keyof typeof TYPE_AI_LABELS;

/**
 * El botón que crea el primer elemento de cada pestaña que es una lista, y el
 * mensaje que sale mientras está vacía. Iban escritos en cada tarjeta y no se
 * parecían: «Agregar Pregunta» con mayúscula al lado de «Agregar producto», y
 * cada mensaje vacío con su propia frase.
 */
export const AGREGAR_EN_LA_PESTANA = {
  training: "Agregar paso",
  faq: "Agregar pregunta",
  products: "Agregar producto",
  more: "Agregar extra",
  keywords: "Agregar regla",
  // Gestión no tiene botón propio: se empieza por el menú de acciones.
  management: "Agregar acción",
} as const;

export const PESTANA_VACIA = {
  training: `No has creado pasos. Crea el primero con «${AGREGAR_EN_LA_PESTANA.training}».`,
  faq: `No has creado preguntas. Crea la primera con «${AGREGAR_EN_LA_PESTANA.faq}».`,
  products: `No has creado productos. Crea el primero con «${AGREGAR_EN_LA_PESTANA.products}».`,
  more: `No has creado extras. Crea el primero con «${AGREGAR_EN_LA_PESTANA.more}».`,
  keywords: `No has creado reglas. Crea la primera con «${AGREGAR_EN_LA_PESTANA.keywords}».`,
  management: `No has creado bloques de gestión. Crea el primero con «${AGREGAR_EN_LA_PESTANA.management}».`,
} as const;

/**
 * «Expandir todo / Colapsar todo»: el mismo botón en las cinco listas. Uno era
 * un `Button` fantasma y los otros cuatro un botón de texto, así que al pasar
 * de una pestaña a otra cambiaba de forma.
 */
export const BOTON_EXPANDIR_TODO =
  "h-7 rounded px-2 text-xs text-muted-foreground transition-colors hover:text-foreground";

/**
 * Lo que abre el «⋯» de la barra del editor. El menú y la ventana que abre
 * cada opción se llaman IGUAL: el menú decía «IA Prompts» y abría un «Chat
 * IA», y decía «Métricas del agente» y abría «Métricas del Agente IA». Se
 * pulsaba una cosa y se abría otra con otro nombre.
 */
export const OPCIONES_DEL_AGENTE = {
  // «IA Prompts» se queda: es el nombre que ya usa el tutorial en vídeo de
  // esta pantalla. Lo que cambia es la ventana, que decía «Chat IA».
  asistente: "IA Prompts",
  voz: "Voz del agente",
  metricas: "Métricas del agente",
  historial: "Historial de versiones",
  eliminar: "Eliminar todo",
} as const;

/**
 * Borrar un elemento de una lista: el botón rojo de la tarjeta y la ventana
 * que pide confirmarlo dicen LO MISMO. Estaban escritos en cada tarjeta y no
 * cuadraban: el paso de Inicio abría «Eliminar entrenamiento» —que se lee
 * como borrar el agente entero, y solo borraba un paso—, Preguntas decía
 * «esta Pregunta» con mayúscula y Extras «esta información».
 */
export const ELIMINAR_EN_LA_PESTANA = {
  training: { titulo: "Eliminar paso", texto: "¿Seguro que quieres eliminar este paso? Esta acción no se puede deshacer." },
  faq: { titulo: "Eliminar pregunta", texto: "¿Seguro que quieres eliminar esta pregunta? Esta acción no se puede deshacer." },
  products: { titulo: "Eliminar producto", texto: "¿Seguro que quieres eliminar este producto? Esta acción no se puede deshacer." },
  more: { titulo: "Eliminar extra", texto: "¿Seguro que quieres eliminar este extra? Esta acción no se puede deshacer." },
  management: { titulo: "Eliminar gestión", texto: "¿Seguro que quieres eliminar esta gestión? Esta acción no se puede deshacer." },
  // Una regla se borraba al primer clic, sin preguntar: la única lista del
  // editor que no pedía confirmación.
  keywords: { titulo: "Eliminar regla", texto: "¿Seguro que quieres eliminar esta regla? Esta acción no se puede deshacer." },
} as const;
