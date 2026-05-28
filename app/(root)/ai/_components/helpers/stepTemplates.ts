export type TemplateCategory =
    | "Conexión"
    | "Averiguación"
    | "Diagnóstico"
    | "Exposición"
    | "Negociación"
    | "Acuerdo"
    | "Postventa";

export type StepTemplate = {
    id: string;
    name: string;
    category: TemplateCategory;
    description: string;
    content: string;
};

export const STEP_TEMPLATES: StepTemplate[] = [

    /* ─────────────────────────────────────────
       FASE 1 — CONEXIÓN
       Objetivo: contacto humano, romper el hielo,
       generar confianza, validar canal de origen.
    ───────────────────────────────────────── */
    {
        id: "conexion_primer_contacto",
        name: "Primer contacto",
        category: "Conexión",
        description: "Saludo inicial, auto-presentación y pregunta de apertura única",
        content: `Saluda al cliente por su nombre si está disponible. Preséntate con el nombre del negocio y el nombre del agente. Formula una única pregunta de apertura para descubrir su intención.

- Usa un saludo cálido y profesional acorde al tono del negocio.
- Preséntate con claridad: nombre del negocio + nombre del agente.
- Si no tienes el nombre del cliente, solicítalo en esta primera interacción.
- Formula UNA sola pregunta abierta de apertura — nunca dos a la vez.
- No ofrezcas productos ni precios en este paso.`,
    },
    {
        id: "conexion_referido",
        name: "Cliente referido o recurrente",
        category: "Conexión",
        description: "Reconocer a quien llegó por recomendación o ya ha comprado antes",
        content: `Reconoce que el cliente llega referido o que ya ha tenido contacto previo con el negocio. Personaliza el saludo para generar confianza inmediata.

- Si es referido: menciona que te alegra que lo hayan recomendado y pregunta quién lo envió.
- Si es recurrente: agradece que vuelva y pregunta en qué puedes ayudarle esta vez.
- Usa el nombre si está disponible.
- Formula UNA sola pregunta de apertura para descubrir su necesidad actual.
- No repitas información que ya conoce del negocio — ve directo al punto.`,
    },

    /* ─────────────────────────────────────────
       FASE 2 — AVERIGUACIÓN
       Objetivo: descubrir la intención real
       (qué busca, por qué llegó).
    ───────────────────────────────────────── */
    {
        id: "averiguacion_intencion",
        name: "Descubrir intención",
        category: "Averiguación",
        description: "Pregunta abierta para identificar el motivo de contacto e interés principal",
        content: `Haz una pregunta abierta para que el cliente exprese con sus propias palabras qué lo trajo. Escucha activamente y resume lo que entendiste antes de avanzar.

- Usa una pregunta abierta que no se responda con sí o no.
- No sugiereas opciones todavía — deja que el cliente hable primero.
- Una vez que responda, resume en una frase lo que entendiste para validar.
- Identifica si es producto, servicio o información lo que busca.
- Detecta si es cliente nuevo, recurrente o referido según lo que comparte.`,
    },
    {
        id: "averiguacion_tipo_cliente",
        name: "Identificar tipo de cliente",
        category: "Averiguación",
        description: "Detectar si es nuevo, recurrente o referido y su nivel de conocimiento del producto",
        content: `Pregunta de forma natural para identificar si el cliente ya conoce el negocio y cuánto sabe sobre lo que ofreces. Esto define qué tan profunda debe ser la presentación.

- Pregunta si ya ha tenido experiencia previa con el producto o servicio.
- Detecta si llegó por redes sociales, recomendación, búsqueda o publicidad.
- Si ya es cliente, pregunta qué lo trae esta vez.
- Si es nuevo, pregunta cómo conoció el negocio.
- Con base en su respuesta, ajusta el nivel de detalle del siguiente paso.`,
    },

    /* ─────────────────────────────────────────
       FASE 3 — DIAGNÓSTICO
       Objetivo: calificar con preguntas estructuradas
       (BANT adaptado). Una pregunta por turno.
    ───────────────────────────────────────── */
    {
        id: "diagnostico_necesidad",
        name: "Validar necesidad real",
        category: "Diagnóstico",
        description: "Preguntas para confirmar la necesidad real, no la asumida",
        content: `Valida con preguntas estructuradas qué necesita exactamente el cliente, para qué y en qué contexto lo usará. Una pregunta por turno.

- Pregunta para qué usará el producto o servicio (uso personal, negocio, regalo).
- Valida la necesidad con una pregunta de confirmación antes de avanzar.
- No asumas la necesidad — que el cliente la exprese con sus palabras.
- Si la respuesta es vaga, haz una pregunta de profundización.
- Registra la necesidad confirmada antes de pasar a presupuesto o urgencia.`,
    },
    {
        id: "diagnostico_presupuesto_urgencia",
        name: "Detectar presupuesto y urgencia",
        category: "Diagnóstico",
        description: "Identificar rango de inversión y cuándo necesita la solución",
        content: `Detecta cuánto está dispuesto a invertir el cliente y cuándo necesita la solución. Hazlo de forma natural, una variable por turno.

- Pregunta cuándo necesita el producto o servicio (urgencia).
- Pregunta por su rango de inversión o presupuesto de forma indirecta y natural.
- Si duda en responder sobre presupuesto, ofrece rangos como referencia.
- Identifica si quien habla es quien toma la decisión de compra.
- No presiones — si no da el dato, avanza igual y ajusta la propuesta.`,
    },

    /* ─────────────────────────────────────────
       FASE 4 — EXPOSICIÓN
       Objetivo: presentar la solución personalizada
       con valor claro. Beneficios, no características.
    ───────────────────────────────────────── */
    {
        id: "exposicion_propuesta_unica",
        name: "Propuesta personalizada",
        category: "Exposición",
        description: "Presentar una solución específica basada en el diagnóstico previo",
        content: `Resume el diagnóstico del cliente antes de presentar la solución. Recomienda una opción principal justificada con lo que el cliente dijo que necesita.

- Inicia resumiendo la necesidad del cliente en una frase: "Según lo que me cuentas...".
- Presenta UNA opción principal con su beneficio principal (no sus características).
- Justifica por qué esa opción específica encaja con su necesidad y presupuesto.
- Presenta el precio y condiciones con claridad, sin rodeos.
- Si aplica, menciona prueba social (testimonios, casos similares).
- Cierra con una pregunta de validación: "¿Esto se ajusta a lo que buscas?".`,
    },
    {
        id: "exposicion_multiples_opciones",
        name: "Presentar 2-3 opciones",
        category: "Exposición",
        description: "Mostrar opciones comparables cuando el cliente tiene margen de decisión",
        content: `Cuando el cliente tiene flexibilidad de decisión, presenta máximo 3 opciones ordenadas por ajuste a su diagnóstico. Más de 3 opciones paralizan la decisión.

- Resume el diagnóstico antes de presentar opciones.
- Presenta las opciones de menor a mayor inversión o complejidad.
- Para cada opción: beneficio principal + precio + diferencial clave. Nada más.
- Recomienda explícitamente cuál es la mejor opción para su caso y por qué.
- Termina con una pregunta directa: "¿Cuál de estas opciones te interesa más?".
- Nunca presentes más de 3 opciones — reduce, no abruma.`,
    },

    /* ─────────────────────────────────────────
       FASE 5 — NEGOCIACIÓN
       Objetivo: manejar objeciones sin presionar.
       NO insistir más de 2 veces ante un "no".
    ───────────────────────────────────────── */
    {
        id: "negociacion_precio",
        name: "Objeción de precio",
        category: "Negociación",
        description: "Responder cuando el cliente dice que está caro o pide descuento",
        content: `Valida la objeción de precio con empatía antes de defender el valor. Nunca respondas directamente con "es que...". Primero entiende, luego argumenta.

- Valida: "Entiendo perfectamente, el precio es una consideración importante."
- Explica qué incluye el precio y qué problema resuelve concretamente.
- Destaca el costo de NO resolver el problema o de elegir una opción más barata.
- Si tienes una alternativa de menor precio, preséntala sin devaluar la principal.
- Refuerza con prueba social si la tienes (clientes similares, resultados).
- Si insiste en un precio que no puedes dar, acepta con respeto y cierra sin presionar.
- Regla: no insistas más de 2 veces. Un "no" firme es un "no".`,
    },
    {
        id: "negociacion_confianza",
        name: "Objeción de confianza",
        category: "Negociación",
        description: "Responder cuando el cliente duda de la calidad o seriedad del negocio",
        content: `Cuando el cliente duda antes de comprometerse por desconfianza, genera credibilidad con evidencia concreta, no con promesas.

- Valida: "Es normal querer asegurarse antes de tomar una decisión."
- Ofrece evidencia concreta: reseñas, fotos de trabajos anteriores, referencias.
- Menciona garantías, políticas de cambio o devolución si las tienes.
- Comparte redes sociales, sitio web o portafolio para que pueda verificar.
- Si es posible, ofrece una muestra, demo o prueba piloto.
- No prometas lo que no puedes cumplir — la confianza se gana con hechos.
- Regla: no insistas más de 2 veces. Si no confía, no es el momento adecuado.`,
    },
    {
        id: "negociacion_tiempo",
        name: "Objeción de tiempo",
        category: "Negociación",
        description: "Responder cuando el cliente dice que necesita pensarlo o no es el momento",
        content: `Cuando el cliente pide tiempo para pensar, identifica si es una objeción real o una duda no resuelta. Responde con empatía y claridad.

- Valida: "Por supuesto, es una decisión importante y quiero que te sientas seguro."
- Pregunta qué necesitaría para tomar la decisión con confianza.
- Si hay una duda específica sin resolver, resuélvela antes de dejar ir al cliente.
- Si hay una oferta por tiempo limitado, menciona la urgencia con honestidad, sin manipular.
- Ofrece quedar pendiente: "¿Cuándo sería un buen momento para retomar?".
- Regla: no insistas más de 2 veces. Cierra la conversación con un siguiente paso claro.`,
    },

    /* ─────────────────────────────────────────
       FASE 6 — ACUERDO
       Objetivo: concretar la conversión
       (compra, agenda, pago, firma).
    ───────────────────────────────────────── */
    {
        id: "acuerdo_cierre_compra",
        name: "Cierre de compra",
        category: "Acuerdo",
        description: "Confirmar la decisión, recolectar datos y enviar instrucciones de pago",
        content: `Cuando el cliente da señales de querer avanzar, confirma la decisión de forma explícita y guía los siguientes pasos con claridad.

- Confirma la decisión: "Perfecto, ¿procedemos entonces con [producto/servicio]?"
- Resume brevemente lo acordado: producto, precio, condiciones de entrega.
- Solicita los datos necesarios para procesar el pedido (uno por turno).
- Envía instrucciones claras y simples de pago o proceso de compra.
- Confirma cuando recibas el pago o comprobante.
- Agradece la confianza y confirma qué pasa a continuación.
- Transfiere a un asesor humano si la lógica del negocio lo requiere.`,
    },
    {
        id: "acuerdo_agendar_cita",
        name: "Agendar cita o servicio",
        category: "Acuerdo",
        description: "Coordinar fecha, hora y detalles para servicios con agenda",
        content: `Cuando la conversión es una cita, reunión o servicio agendado, confirma fecha, hora y detalles con precisión para evitar confusiones.

- Confirma que el cliente quiere agendar: "¿Procedemos con la cita entonces?"
- Ofrece 2-3 opciones de fecha y hora disponibles — nunca preguntes "¿cuándo quieres?".
- Confirma los datos del cliente (nombre completo, teléfono, dirección si aplica).
- Resume la cita confirmada: fecha, hora, lugar o modalidad, qué traer o preparar.
- Envía un resumen por escrito para que el cliente tenga referencia.
- Indica si hay algún paso adicional (pago anticipado, confirmación 24h antes, etc.).`,
    },

    /* ─────────────────────────────────────────
       FASE 7 — POSTVENTA
       Objetivo: convertir comprador en cliente
       recurrente y referidor.
    ───────────────────────────────────────── */
    {
        id: "postventa_confirmacion",
        name: "Confirmación de entrega",
        category: "Postventa",
        description: "Verificar que el cliente recibió el producto o servicio correctamente",
        content: `Después de la entrega o prestación del servicio, contacta al cliente para confirmar que todo llegó bien y abrir espacio para resolver cualquier inconveniente.

- Saluda por nombre y menciona que es un seguimiento de su compra reciente.
- Pregunta si recibió el producto o servicio en las condiciones acordadas.
- Si hay algún problema, atiéndelo con prioridad antes de pedir retroalimentación.
- Si todo está bien, agradece la confianza y pregunta si tiene alguna duda.
- Registra el feedback recibido para mejora del proceso.`,
    },
    {
        id: "postventa_recomendacion",
        name: "Solicitar reseña y referido",
        category: "Postventa",
        description: "Pedir retroalimentación y activar el ciclo de referidos",
        content: `Una vez confirmada la satisfacción del cliente, solicita una reseña y activa el ciclo de referidos. El momento ideal es justo después de confirmar que está satisfecho.

- Agradece de forma genuina que haya confiado en el negocio.
- Pide su opinión de forma directa: "¿Podrías dejarnos una reseña en [plataforma]?"
- Si no puede dejar reseña, pregunta si conoce a alguien que pueda necesitar el servicio.
- Comparte el enlace de reseña o referido de forma clara y sencilla.
- Menciona si hay algún beneficio por referir (descuento, cortesía, bono).
- Cierra con un mensaje que deje la puerta abierta para futuras compras.`,
    },
];

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
    "Conexión",
    "Averiguación",
    "Diagnóstico",
    "Exposición",
    "Negociación",
    "Acuerdo",
    "Postventa",
];
