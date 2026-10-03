/**
 * La GUÍA PÚBLICA de Follow-ups IA (`/guia/follow-ups`): qué dice cada sección
 * y qué captura enseña cada paso. Puro: lo leen la página, el script que toma
 * las capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que pintan
 * los componentes de `/crm/rules` (`CrmFollowUpRulesPanel`, los tres asistentes,
 * `LeadStatusWorkflowPanel`, `CrmFollowUpMediaLibrary`) y con
 * `lib/follow-ups-de-la-pantalla.ts`. Un paso o un campo nuevo en la pantalla
 * sin su nombre aquí pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Follow-ups IA en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_FOLLOW_UPS = "Creación de Flujos";

/** Las cinco ZONAS de la pantalla, tal como las numera «Todo en una pantalla». */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Las tres pestañas",
    "Los pasos del asistente",
    "Los botones de abajo",
] as const;

/** Las tres pestañas, en su orden. El banco las compara con `PESTANAS_DE_FOLLOW_UPS`. */
export const PESTANAS_DOCUMENTADAS = ["Sintetizador", "Clasificación de leads", "Follow-ups"] as const;

/** Los cuatro pasos del sintetizador. El banco los compara con `CrmLeadFunnelPromptWizard.tsx`. */
export const PASOS_DEL_SINTETIZADOR = ["Marco base", "Reglas globales", "Tipos CRM", "Previsualización"] as const;

/** Los cuatro pasos de la clasificación. El banco los compara con `CrmLeadStatusPromptWizard.tsx`. */
export const PASOS_DE_LA_CLASIFICACION = ["Marco base", "Definiciones", "Criterios", "Previsualización"] as const;

/** Los tipos de registro que distingue el sintetizador (`CRM_PROMPT_RECORD_TYPES`). */
export const TIPOS_DEL_SINTETIZADOR = ["SOLICITUD", "PEDIDO", "RECLAMO", "RESERVA", "PAGO"] as const;

/** Los cinco estados de un lead, en el orden de los pasos de Follow-ups. */
export const ESTADOS_DOCUMENTADOS = ["Frio", "Tibio", "Caliente", "Finalizado", "Descartado"] as const;

/** Los campos de la regla de un estado. El banco los compara con `CAMPOS_DE_LA_REGLA`. */
export const CAMPOS_DOCUMENTADOS = [
    "Espera antes de escribir",
    "Máx. intentos",
    "Desde",
    "Hasta",
    "Días habilitados",
    "Objetivo",
    "Prompt interno",
    "Mensaje de respaldo",
] as const;

/** Los botones de abajo de Follow-ups, en su orden (`CrmFollowUpWizard.tsx`). */
export const BOTONES_DE_ABAJO = ["Anterior", "Siguiente", "Resetear cambios", "Guardar reglas"] as const;

/** Cuántos archivos admite la biblioteca de un estado (`MAX_MEDIA_PER_STATUS`). */
export const ARCHIVOS_POR_ESTADO = 8;

export const GUIA_FOLLOW_UPS: Contenido = {
    titulo: "Follow-ups IA",
    subtitulo: "La IA resume, clasifica y vuelve a escribirle a cada lead",
    descripcion:
        "Follow-ups IA reúne las tres cosas que la IA hace sola con tus conversaciones: el sintetizador resume cada " +
        "chat y guarda las solicitudes, pedidos y pagos; la clasificación decide si un lead está frío, tibio o " +
        "caliente; y los follow-ups le vuelven a escribir a quien dejó de responder, con la espera, el horario, el " +
        "mensaje, los archivos y el flujo que tú elijas para cada estado.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, las tres pestañas y el asistente que te lleva paso a paso.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · 3 Las " +
                        "tres pestañas · 4 Los pasos del asistente · 5 Los botones de abajo.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Follow-ups IA con sus cinco partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Follow-ups IA está dentro de Creación de Flujos. Al " +
                        "entrar a una pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Follow-ups IA dentro de Creación de Flujos",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "Las tres pestañas",
                    texto:
                        "1 Sintetizador: resume cada conversación · 2 Clasificación de leads: decide su estado · " +
                        "3 Follow-ups: le vuelve a escribir según ese estado. Cada una es un asistente aparte.",
                    imagen: "pestanas.webp",
                    alt: "Las tres pestañas de la pantalla numeradas",
                },
                {
                    titulo: "Un asistente por pasos",
                    texto:
                        "Arriba, los pasos del asistente: pulsa cualquiera para ir directo. Abajo, Anterior y " +
                        "Siguiente te llevan en orden, y el botón azul guarda.",
                    imagen: "pasos-y-botones.webp",
                    alt: "Los pasos del asistente arriba y los botones de abajo resaltados",
                },
            ],
            consejos: [
                "Cada pestaña se guarda por separado: guardar el sintetizador no toca los follow-ups.",
                "Si una pestaña no sale, esa función no está activada en tu cuenta: pídela a soporte.",
            ],
        },
        {
            slug: "sintetizador",
            titulo: "El sintetizador",
            resumen: "Cómo la IA resume cada conversación y reconoce solicitudes, pedidos, reclamos, reservas y pagos.",
            icono: "Sparkles",
            miniatura: "mini-sintetizador.webp",
            pasos: [
                {
                    titulo: "Paso 1 · Marco base",
                    texto:
                        "1 El papel de la IA · 2 Cuándo un mensaje es solo un reporte · 3 Cuándo hay que guardar un " +
                        "registro. Es lo primero que lee la IA antes de decidir.",
                    imagen: "sintetizador-marco.webp",
                    alt: "El paso Marco base del sintetizador con sus campos numerados",
                },
                {
                    titulo: "Paso 2 · Reglas globales",
                    texto:
                        "Las reglas que valen para todo: qué no hacer nunca, qué tipo gana si dos encajan, la regla " +
                        "especial de los pagos y lo que quieras añadir al final.",
                    imagen: "sintetizador-reglas.webp",
                    alt: "El paso Reglas globales del sintetizador",
                },
                {
                    titulo: "Paso 3 · Tipos CRM",
                    texto:
                        "Una caja por tipo de registro: solicitud, pedido, reclamo, reserva y pago. En cada una " +
                        "explicas con tus palabras cómo reconocerlo en tu negocio.",
                    imagen: "sintetizador-tipos.webp",
                    alt: "El paso Tipos CRM con una caja por tipo de registro",
                },
                {
                    titulo: "Paso 4 · Previsualización",
                    texto:
                        "1 Cuándo se publicó por última vez · 2 El texto completo que recibirá la IA, armado con lo " +
                        "que escribiste en los pasos anteriores.",
                    imagen: "sintetizador-previsualizacion.webp",
                    alt: "La previsualización del sintetizador con el texto final",
                },
                {
                    titulo: "Guarda",
                    texto:
                        "«Guardar sintetizador» publica los cambios. «Resetear cambios» deshace lo que no guardaste y " +
                        "«Restaurar valores de fábrica» vuelve al texto de la plataforma.",
                    imagen: "sintetizador-guardar.webp",
                    alt: "Los botones de guardar del sintetizador resaltados",
                },
            ],
            consejos: [
                "Una solicitud solo se guarda cuando ya están el nombre del cliente, el producto y los detalles: pedir precios va a la síntesis.",
                "Escribe como le explicarías el trabajo a una persona nueva: frases cortas y con ejemplos de tu negocio.",
            ],
        },
        {
            slug: "clasificacion",
            titulo: "La clasificación de leads",
            resumen: "Cómo decide la IA si un lead está frío, tibio, caliente, finalizado o descartado.",
            icono: "Tags",
            miniatura: "mini-clasificacion.webp",
            pasos: [
                {
                    titulo: "Paso 1 · Marco base",
                    texto:
                        "1 El papel de la IA · 2 Cómo debe responder · 3 Cómo explica el motivo. Abajo, las " +
                        "instrucciones extra que quieras sumar.",
                    imagen: "clasificacion-marco.webp",
                    alt: "El paso Marco base de la clasificación con sus campos numerados",
                },
                {
                    titulo: "Paso 2 · Definiciones",
                    texto:
                        "Una caja por estado: qué significa en tu negocio estar frío, tibio, caliente, finalizado o " +
                        "descartado.",
                    imagen: "clasificacion-definiciones.webp",
                    alt: "El paso Definiciones con una caja por estado",
                },
                {
                    titulo: "Paso 3 · Criterios",
                    texto:
                        "Las señales concretas para elegir cada estado, empezando por descartado y terminando por " +
                        "frío: así la IA revisa primero los casos más claros.",
                    imagen: "clasificacion-criterios.webp",
                    alt: "El paso Criterios con una caja por estado",
                },
                {
                    titulo: "Paso 4 · Previsualización",
                    texto:
                        "Revisa el texto completo que leerá la IA antes de publicarlo, y guárdalo con «Guardar " +
                        "clasificación».",
                    imagen: "clasificacion-previsualizacion.webp",
                    alt: "La previsualización de la clasificación con el texto final",
                },
            ],
            consejos: [
                "El estado que decide la IA es el que usan los follow-ups: un lead caliente recibe el seguimiento de caliente.",
                "El estado también se ve en Chats, en Leads y en el tablero de Calificación.",
            ],
        },
        {
            slug: "follow-ups-por-estado",
            titulo: "Los follow-ups por estado",
            resumen: "Una regla para cada estado del lead: si se le vuelve a escribir, cuándo y cómo.",
            icono: "Send",
            miniatura: "mini-follow-ups-por-estado.webp",
            pasos: [
                {
                    titulo: "Un paso por estado",
                    texto:
                        "Frío, tibio, caliente, finalizado y descartado: cada estado es un paso del asistente con su " +
                        "propia regla. El último, Resumen, las junta todas.",
                    imagen: "estados.webp",
                    alt: "Los pasos de Follow-ups, uno por estado y el Resumen",
                },
                {
                    titulo: "Enciéndela o apágala",
                    texto:
                        "El interruptor «Activa» decide si ese estado recibe follow-ups. Apagado, a esos leads no se " +
                        "les escribe solo y sus campos quedan en gris.",
                    imagen: "activa.webp",
                    alt: "El interruptor Activa de la regla resaltado",
                },
                {
                    titulo: "Vuelve a lo de fábrica",
                    texto:
                        "«Restaurar valores de fábrica» devuelve esa regla a como venía: su espera, sus intentos, su " +
                        "horario y sus mensajes.",
                    imagen: "restaurar.webp",
                    alt: "El botón Restaurar valores de fábrica resaltado",
                },
            ],
            consejos: [
                "Finalizado y descartado vienen con un trato especial: escribirle a quien ya compró o dijo que no se hace con cuidado.",
                "Un follow-up se cancela solo en cuanto el lead vuelve a escribir.",
            ],
        },
        {
            slug: "tiempos-e-intentos",
            titulo: "Tiempos e intentos",
            resumen: "Cuánto esperar antes de escribir y cuántas veces insistir.",
            icono: "CalendarClock",
            miniatura: "mini-tiempos-e-intentos.webp",
            pasos: [
                {
                    titulo: "La espera",
                    texto:
                        "«Espera antes de escribir» es cuánto tiempo pasa desde el último mensaje del lead hasta el " +
                        "follow-up. Se elige en minutos, horas o días.",
                    imagen: "espera.webp",
                    alt: "El campo Espera antes de escribir resaltado",
                },
                {
                    titulo: "Los intentos",
                    texto:
                        "«Máx. intentos» es cuántas veces se le escribe si sigue sin responder. Cada intento vuelve a " +
                        "esperar el mismo tiempo. Con 0 no se le escribe nunca.",
                    imagen: "intentos.webp",
                    alt: "El campo Máx. intentos resaltado",
                },
                {
                    titulo: "En el resumen",
                    texto:
                        "El último paso, Resumen, enseña la espera y los intentos de cada estado en una línea, para " +
                        "compararlos de un vistazo.",
                    imagen: "tiempos-en-el-resumen.webp",
                    alt: "Las líneas del resumen con la espera y los intentos de cada estado",
                },
            ],
            consejos: [
                "A un lead frío conviene darle más tiempo; a uno caliente, menos.",
                "Tres intentos suelen bastar: insistir de más hace que te bloqueen.",
            ],
        },
        {
            slug: "horario",
            titulo: "Horario y días",
            resumen: "A qué horas y qué días puede salir un follow-up.",
            icono: "CalendarRange",
            miniatura: "mini-horario.webp",
            pasos: [
                {
                    titulo: "Desde y hasta",
                    texto:
                        "La franja del día en que se puede escribir. Si la espera termina fuera de ella, el mensaje " +
                        "sale al empezar la franja siguiente.",
                    imagen: "desde-hasta.webp",
                    alt: "Los campos Desde y Hasta resaltados",
                },
                {
                    titulo: "Los días",
                    texto:
                        "En Días habilitados marcas los días en que se puede escribir. Un día sin marcar se salta: el mensaje espera al " +
                        "siguiente día marcado.",
                    imagen: "dias.webp",
                    alt: "Los días de la semana con los habilitados marcados",
                },
                {
                    titulo: "Tu zona horaria",
                    texto:
                        "Las horas son las de tu cuenta. El Resumen dice qué zona horaria se está usando.",
                    imagen: "zona-horaria.webp",
                    alt: "El resumen general con la zona horaria resaltada",
                },
            ],
            consejos: ["Nadie quiere un mensaje de una empresa a las once de la noche: usa tu horario de atención."],
        },
        {
            slug: "mensajes",
            titulo: "Los mensajes",
            resumen: "Qué busca el follow-up, cómo lo escribe la IA y qué sale si la IA no puede.",
            icono: "MessageSquare",
            miniatura: "mini-mensajes.webp",
            pasos: [
                {
                    titulo: "El objetivo",
                    texto:
                        "Qué quieres conseguir con ese mensaje, en una frase: retomar la conversación, resolver una " +
                        "duda, cerrar la venta.",
                    imagen: "objetivo.webp",
                    alt: "El campo Objetivo resaltado",
                },
                {
                    titulo: "El prompt interno",
                    texto:
                        "Cómo quieres que escriba la IA: el tono, qué mencionar, qué no prometer. La IA lo lee junto " +
                        "a la conversación y escribe un mensaje a medida para ese lead.",
                    imagen: "prompt.webp",
                    alt: "El campo Prompt interno resaltado",
                },
                {
                    titulo: "El mensaje de respaldo",
                    texto:
                        "El texto fijo que sale si la IA no puede escribir uno, por ejemplo si no le quedan créditos. " +
                        "Así el lead nunca se queda sin su seguimiento.",
                    imagen: "respaldo.webp",
                    alt: "El campo Mensaje de respaldo resaltado",
                },
            ],
            consejos: [
                "El cliente no ve ni el objetivo ni el prompt: solo el mensaje que escribe la IA.",
                "Escribe el respaldo como si fuera el único mensaje: corto y con una pregunta.",
            ],
        },
        {
            slug: "biblioteca",
            titulo: "La biblioteca de archivos",
            resumen: "Fotos, vídeos, audios y PDF que la IA puede mandar junto al follow-up.",
            icono: "Paperclip",
            miniatura: "mini-biblioteca.webp",
            pasos: [
                {
                    titulo: "Ábrela",
                    texto:
                        "«Biblioteca de remarketing», debajo del flujo, abre los archivos de ese estado. Cada " +
                        "estado tiene los suyos.",
                    imagen: "biblioteca-abrir.webp",
                    alt: "El botón de la biblioteca de remarketing resaltado",
                },
                {
                    titulo: "Agrega un archivo",
                    texto:
                        "1 Elige una imagen, un vídeo, un audio o un PDF, o graba una nota de voz · 2 Ponle un nombre " +
                        "claro · 3 Una descripción, si quieres · 4 Guárdalo en la biblioteca.",
                    imagen: "biblioteca-agregar.webp",
                    alt: "El formulario para agregar un archivo con sus partes numeradas",
                },
                {
                    titulo: "Tus archivos",
                    texto:
                        "Cada archivo sale con su vista previa, su tipo y su nombre. La papelera de la esquina lo quita.",
                    imagen: "biblioteca-archivos.webp",
                    alt: "Los archivos guardados en la biblioteca",
                },
            ],
            consejos: [
                "La IA lee el nombre y la descripción para decidir si el archivo le sirve a ese lead: descríbelo bien.",
                `Caben hasta ${ARCHIVOS_POR_ESTADO} archivos por estado.`,
            ],
        },
        {
            slug: "flujo-por-estado",
            titulo: "Un flujo por estado",
            resumen: "Lanza un flujo automático en cuanto un lead cambia a ese estado.",
            icono: "GitBranch",
            miniatura: "mini-flujo-por-estado.webp",
            pasos: [
                {
                    titulo: "Dónde está",
                    texto:
                        "Debajo de los mensajes de cada estado está «disparar un flujo». Cada estado puede tener " +
                        "el suyo.",
                    imagen: "flujo-panel.webp",
                    alt: "El recuadro para elegir el flujo de un estado resaltado",
                },
                {
                    titulo: "Elige el flujo",
                    texto:
                        "En «disparar un flujo», elige uno de tus flujos. Se lanza solo cuando un lead pasa a ese " +
                        "estado.",
                    imagen: "flujo-elegir.webp",
                    alt: "La lista de flujos abierta para un estado",
                },
                {
                    titulo: "Quítalo",
                    texto: "La equis de al lado lo desvincula: el estado deja de lanzar ese flujo.",
                    imagen: "flujo-quitar.webp",
                    alt: "El botón para quitar el flujo resaltado",
                },
            ],
            consejos: [
                "El flujo se lanza una sola vez por cambio de estado, y los mensajes pendientes del flujo anterior se cancelan.",
                "Los flujos se crean en Creación de Flujos › Crear flujos.",
            ],
        },
        {
            slug: "resumen-y-guardar",
            titulo: "Resumen y guardar",
            resumen: "Revisa todas las reglas de un vistazo y guárdalas.",
            icono: "ListChecks",
            miniatura: "mini-resumen-y-guardar.webp",
            pasos: [
                {
                    titulo: "El resumen",
                    texto:
                        "1 El resumen general, con tu zona horaria · 2 Cada estado en una línea: su espera, sus " +
                        "intentos y su horario, o «Regla desactivada».",
                    imagen: "resumen.webp",
                    alt: "El paso Resumen con sus dos partes numeradas",
                },
                {
                    titulo: "Guarda",
                    texto: "«Guardar reglas» guarda los cinco estados a la vez, con todo lo que cambiaste en cada uno.",
                    imagen: "guardar.webp",
                    alt: "El botón Guardar reglas resaltado",
                },
                {
                    titulo: "Deshaz lo que no guardaste",
                    texto:
                        "«Resetear cambios» vuelve a lo último que guardaste, en todos los estados. No toca lo que ya " +
                        "estaba guardado.",
                    imagen: "resetear.webp",
                    alt: "El botón Resetear cambios resaltado",
                },
            ],
            consejos: ["Los botones de guardar se apagan cuando no hay nada que guardar."],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("follow-ups", GUIA_FOLLOW_UPS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
