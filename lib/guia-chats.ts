/**
 * La GUÍA PÚBLICA de Chats (`/guia/chats`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que
 * pintan los componentes de `app/(root)/chats/_components/` —la lista y sus
 * pastillas, la barra de la selección, la cabecera, el menú de Acciones, el
 * «⋯» de un mensaje, la barra de escribir y la tarjeta de la llamada—. Un mando
 * nuevo con su nombre fuera de aquí pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Chats en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_CHATS = "Bandeja";

/** Las cuatro ZONAS de la pantalla, como las numera «Todo en una pantalla». */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La lista de conversaciones",
    "La conversación abierta",
] as const;

/** Las pastillas de arriba de la lista, en su orden. El banco las compara con `ChatTabBar.tsx`. */
export const PASTILLAS_DOCUMENTADAS = ["Mías", "Todos", "Sin leer", "En espera"] as const;

/** Los filtros de la flecha del final de las pastillas. */
export const FILTROS_DE_LA_FLECHA = ["Destacados", "Con notas", "Archivados", "Resueltos"] as const;

/** El «⋯» de una conversación de la lista, en su orden. */
export const ACCIONES_DE_LA_FILA = [
    "Marcar como no leído",
    "Marcar como resuelto",
    "Asignar agente",
    "Clasificar lead",
    "Asignar etiqueta",
    "Copiar número",
    "Cambiar nombre",
    "Anclar chat",
    "Archivar chat",
    "Eliminar chat",
] as const;

/** Lo que se hace sobre varias conversaciones a la vez (`BulkActionBar.tsx`). */
export const ACCIONES_DE_LA_SELECCION = [
    "Marcar como leído / no leído",
    "Resolver conversaciones",
    "Destacar",
    "Anclar / Desanclar",
    "Archivar / Desarchivar",
    "Asignar asesor",
    "Agregar etiqueta",
] as const;

/** Los botones de la cabecera de la conversación, de izquierda a derecha (su `aria-label`). */
export const BOTONES_DE_LA_CABECERA = [
    "Llamar",
    "Mi conversación",
    "Crear recordatorio para este lead",
    "Estado de cita",
    "Nueva tarea",
    "Registros del lead",
    "Ver contexto del lead",
    "Etapa del embudo",
    "Etiquetas",
    "Ver ficha del contacto",
] as const;

/** El menú de Acciones de la conversación, en su orden. */
export const ACCIONES_DEL_MENU = [
    "Nuevo mensaje",
    "Enviar al equipo",
    "Exportar conversación",
    "Transferir a...",
    "Agregar participante...",
    "Liberar conversación",
    "Resolver conversación",
] as const;

/** El «⋯» de un mensaje (`MessageContextMenu.tsx`). */
export const MENU_DEL_MENSAJE = ["Copiar", "Reenviar", "Traducir", "Editar", "Eliminar"] as const;

/** Las reacciones rápidas de un mensaje. */
export const REACCIONES = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

/** Los botones de la barra de escribir (su `aria-label`), de izquierda a derecha. */
export const BOTONES_DE_LA_BARRA_DE_ESCRIBIR = [
    "Firma del asesor",
    "Enviar workflow o respuesta rápida",
    "Adjuntar",
    "Nota interna",
    "Generar respuesta sugerida con IA",
    "Emojis",
    "Dictar por voz",
    "Grabar nota de voz",
    "Enviar",
] as const;

/** Lo que trae el clip de adjuntar. */
export const LO_QUE_SE_ADJUNTA = ["Imagen", "Documento", "Audio (archivo)"] as const;

/** Los mandos de la tarjeta de una llamada en curso. */
export const MANDOS_DE_LA_LLAMADA = ["Silenciar", "Altavoz", "Colgar", "Plegar la llamada"] as const;

export const GUIA_CHATS: Contenido = {
    titulo: "Chats",
    subtitulo: "Todas tus conversaciones de WhatsApp en una sola bandeja",
    descripcion:
        "Chats es donde atiendes a tus clientes: todas las conversaciones de tus líneas de WhatsApp en una " +
        "lista, y al lado la conversación abierta. Desde aquí contestas o dejas que conteste la IA, asignas cada " +
        "chat a un asesor, lo mueves por el embudo, agendas citas y recordatorios, y llamas por WhatsApp sin " +
        "salir de la pantalla.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la lista de conversaciones y la conversación abierta.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La lista de conversaciones · 4 La conversación abierta.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Chats con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Chats está dentro de Bandeja, junto a Llamadas. Al entrar a " +
                        "una pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Chats dentro de Bandeja",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La lista de conversaciones",
                    texto: "1 Canales · 2 Buscador · 3 Filtros · 4 Pastillas · 5 Las conversaciones, la más reciente arriba.",
                    imagen: "columna.webp",
                    alt: "La columna de la lista con cada parte numerada",
                },
                {
                    titulo: "La conversación abierta",
                    texto: "1 La cabecera, con sus botones · 2 Mensajes y Notas · 3 Los mensajes · 4 La barra de escribir.",
                    imagen: "conversacion.webp",
                    alt: "La conversación abierta con cada parte numerada",
                },
            ],
            consejos: [
                "Pulsa una conversación de la lista para abrirla a la derecha; la que tienes abierta queda resaltada.",
                "Las conversaciones que esperan a una persona llevan la mano naranja con los minutos que llevan esperando.",
            ],
        },
        {
            slug: "lista",
            titulo: "La lista y sus filtros",
            resumen: "Las pastillas, los canales, el buscador y los tres puntos de cada conversación.",
            icono: "Filter",
            miniatura: "mini-lista.webp",
            pasos: [
                {
                    titulo: "Mías, Todos, Sin leer y En espera",
                    texto:
                        "Mías son las que te asignaron; Todos, todas; Sin leer, las que tienen mensajes nuevos; y En espera, " +
                        "las que piden una persona. El número dice cuántas hay.",
                    imagen: "lista-pastillas.webp",
                    alt: "Las cuatro pastillas de la lista con su número",
                },
                {
                    titulo: "Más filtros en la flecha",
                    texto: "La flecha del final abre Destacados, Con notas, Archivados y Resueltos, y empezar una conversación nueva.",
                    imagen: "lista-flecha.webp",
                    alt: "El menú de la flecha abierto con los filtros",
                },
                {
                    titulo: "Los canales",
                    texto: "Arriba a la izquierda eliges qué línea ver: Todos las junta, o te quedas con una sola, con su número de chats.",
                    imagen: "lista-canales.webp",
                    alt: "El selector de canales abierto con las líneas de la cuenta",
                },
                {
                    titulo: "Busca una conversación",
                    texto: "Escribe un nombre o parte del número y la lista se queda con lo que coincide.",
                    imagen: "lista-buscar.webp",
                    alt: "Un nombre escrito en el buscador y la conversación encontrada",
                },
                {
                    titulo: "Una conversación de la lista",
                    texto: "1 Nombre y hora · 2 El último mensaje · 3 La línea · 4 Etapa, calificación, asesor y etiquetas.",
                    imagen: "lista-fila.webp",
                    alt: "Una conversación de la lista con cada parte numerada",
                },
                {
                    titulo: "Sus tres puntos",
                    texto: "Marcar como no leído, Marcar como resuelto, Asignar agente, Clasificar lead, Asignar etiqueta, Copiar número, Cambiar nombre, Anclar chat, Archivar chat o Eliminar chat.",
                    imagen: "lista-menu.webp",
                    alt: "El menú de tres puntos de una conversación abierto",
                },
            ],
            consejos: ["«Sin leer» se enciende solo al entrar cuando tienes mensajes nuevos: púlsalo para volver a ver todas."],
        },
        {
            slug: "seleccion",
            titulo: "Varias conversaciones a la vez",
            resumen: "Marca varias y haz lo mismo con todas de una sola vez.",
            icono: "ListChecks",
            miniatura: "mini-seleccion.webp",
            pasos: [
                {
                    titulo: "Pulsa la foto de una conversación",
                    texto: "La foto de la izquierda se convierte en una casilla. Pulsa las de las demás para sumarlas.",
                    imagen: "seleccion-marcar.webp",
                    alt: "Una conversación marcada con su casilla",
                },
                {
                    titulo: "La barra de la selección",
                    texto:
                        "Arriba sale cuántas marcaste y lo que puedes hacer con todas: leer, resolver, exportar, destacar, " +
                        "archivar, anclar, asignar asesor, etiquetar o eliminar.",
                    imagen: "seleccion-barra.webp",
                    alt: "La barra de la selección con sus botones",
                },
                {
                    titulo: "Marcar todas",
                    texto: "La casilla doble marca todas las de la lista; la X quita la selección.",
                    imagen: "seleccion-todas.webp",
                    alt: "Todas las conversaciones de la lista marcadas",
                },
            ],
            consejos: ["Eliminar en bloque pide confirmación: las conversaciones salen de la lista y no se deshace."],
        },
        {
            slug: "cabecera",
            titulo: "La cabecera de la conversación",
            resumen: "Quién es, quién lo atiende y todo lo que haces con ese cliente.",
            icono: "PanelTop",
            miniatura: "mini-cabecera.webp",
            pasos: [
                {
                    titulo: "El nombre y su estado",
                    texto: "El nombre del cliente y su número. Si está en línea o escribiendo, se lee debajo. El lápiz cambia su nombre.",
                    imagen: "cabecera-nombre.webp",
                    alt: "El nombre del cliente en la cabecera con su lápiz",
                },
                {
                    titulo: "Los botones de la cabecera",
                    texto:
                        "1 Llamar · 2 Asesor · 3 Recordatorio · 4 Cita · 5 Tarea · 6 Registros · 7 Contexto del lead · " +
                        "8 Etapa del embudo · 9 Etiquetas · 10 Ficha del contacto.",
                    imagen: "cabecera-botones.webp",
                    alt: "Los botones de la cabecera numerados",
                },
                {
                    titulo: "Quién atiende la conversación",
                    texto: "El botón del asesor dice a quién está asignada. Púlsalo para asignártela, pasarla a otro o dejarla sin asignar.",
                    imagen: "cabecera-asesor.webp",
                    alt: "El menú Asignar asesor abierto con el equipo",
                },
                {
                    titulo: "Busca dentro del chat",
                    texto: "La lupa busca una palabra en los mensajes de esta conversación.",
                    imagen: "cabecera-buscar.webp",
                    alt: "El buscador de la conversación abierto",
                },
            ],
        },
        {
            slug: "agenda",
            titulo: "Recordatorio, cita y tarea",
            resumen: "Lo que tienes que hacer con este cliente, sin salir del chat.",
            icono: "CalendarClock",
            miniatura: "mini-agenda.webp",
            pasos: [
                {
                    titulo: "Un recordatorio",
                    texto: "La campana abre, a la derecha, un recordatorio para este cliente: el mensaje y cuándo le llega por WhatsApp.",
                    imagen: "agenda-recordatorio.webp",
                    alt: "El panel Crear recordatorio abierto a la derecha",
                },
                {
                    titulo: "Su cita",
                    texto: "El calendario enseña la cita que tiene agendada y cambia su estado; si no tiene, «Agendar cita» le pone una.",
                    imagen: "agenda-cita.webp",
                    alt: "El menú de la cita del cliente abierto",
                },
                {
                    titulo: "Una tarea",
                    texto: "La tablilla crea una tarea ligada a este cliente —llamarlo, enviarle algo— y te sale en Mis tareas.",
                    imagen: "agenda-tarea.webp",
                    alt: "El panel Nueva tarea abierto a la derecha",
                },
            ],
        },
        {
            slug: "embudo",
            titulo: "Etapa, etiquetas y contexto",
            resumen: "En qué punto está el cliente y lo que la plataforma sabe de él.",
            icono: "Tags",
            miniatura: "mini-embudo.webp",
            pasos: [
                {
                    titulo: "La etapa del embudo",
                    texto: "El icono de color dice en qué etapa está. Púlsalo y elige otra: la tarjeta se mueve sola en Embudos.",
                    imagen: "embudo-etapa.webp",
                    alt: "El menú de etapas del embudo abierto",
                },
                {
                    titulo: "Sus etiquetas",
                    texto: "La etiqueta pone o quita etiquetas, como «Interesado» o «Mayorista». Las ves también en la lista.",
                    imagen: "embudo-etiquetas.webp",
                    alt: "El menú de etiquetas abierto con las de la cuenta",
                },
                {
                    titulo: "El contexto del lead",
                    texto: "Su puntuación, su estado, sus seguimientos y la síntesis que escribe la IA, que puedes corregir.",
                    imagen: "embudo-contexto.webp",
                    alt: "El panel Contexto del lead abierto a la derecha",
                },
                {
                    titulo: "Sus registros",
                    texto: "Los pedidos, reservas o reclamos que dejó el cliente en la conversación, juntos en una lista.",
                    imagen: "embudo-registros.webp",
                    alt: "El botón de registros del lead resaltado",
                },
            ],
        },
        {
            slug: "acciones",
            titulo: "El menú de Acciones y las macros",
            resumen: "Transferir, sumar a alguien, resolver y hacer varias cosas de un clic.",
            icono: "Zap",
            miniatura: "mini-acciones.webp",
            pasos: [
                {
                    titulo: "Abre Acciones",
                    texto: "Nuevo mensaje, Enviar al equipo, Exportar conversación, Transferir a…, Agregar participante…, Liberar conversación y Resolver conversación.",
                    imagen: "acciones-menu.webp",
                    alt: "El menú Acciones abierto",
                },
                {
                    titulo: "Transferir o sumar a alguien",
                    texto: "«Transferir a…» le pasa la conversación a otro asesor; «Agregar participante…» suma a alguien sin quitártela.",
                    imagen: "acciones-transferir.webp",
                    alt: "El submenú Transferir a con el equipo",
                },
                {
                    titulo: "Resolver la conversación",
                    texto: "Cuando ya la atendiste, «Resolver conversación» la saca de la lista. Si el cliente vuelve a escribir, vuelve sola.",
                    imagen: "acciones-resolver.webp",
                    alt: "Resolver conversación resaltado en el menú",
                },
                {
                    titulo: "Las macros",
                    texto: "Macros hace varias cosas de un clic: etiquetar, calificar, mandar un mensaje. Se crean en Mis macros.",
                    imagen: "acciones-macros.webp",
                    alt: "El menú Macros abierto con las macros de la cuenta",
                },
            ],
        },
        {
            slug: "mensajes",
            titulo: "Los mensajes",
            resumen: "Responder, reenviar, reaccionar, traducir, editar y transcribir una nota de voz.",
            icono: "MessageSquare",
            miniatura: "mini-mensajes.webp",
            pasos: [
                {
                    titulo: "Responder y reenviar",
                    texto: "Pasa el cursor por un mensaje: la flecha lo cita en tu respuesta y la otra lo reenvía a otra conversación.",
                    imagen: "mensajes-responder.webp",
                    alt: "Los botones de responder y reenviar sobre un mensaje",
                },
                {
                    titulo: "Reaccionar",
                    texto: "Sus tres puntos abren las reacciones —👍 ❤️ 😂 😮 😢 🙏— y además Copiar, Reenviar o Eliminar.",
                    imagen: "mensajes-menu.webp",
                    alt: "El menú de un mensaje con las reacciones",
                },
                {
                    titulo: "Traducir",
                    texto: "En un mensaje en otro idioma, «Traducir» lo pone en español debajo. A quien escribe en inglés se le contesta en inglés.",
                    imagen: "mensajes-traducir.webp",
                    alt: "Traducir resaltado en el menú de un mensaje en inglés",
                },
                {
                    titulo: "Editar lo que enviaste",
                    texto: "En tus mensajes, y en los de la IA, «Editar» corrige el texto.",
                    imagen: "mensajes-editar.webp",
                    alt: "Editar resaltado en el menú de un mensaje propio",
                },
                {
                    titulo: "Transcribir una nota de voz",
                    texto: "Debajo de una nota de voz, «Transcribir» la pone por escrito; el botón dice cuántos créditos cuesta.",
                    imagen: "mensajes-transcribir.webp",
                    alt: "Una nota de voz transcrita y otra con su botón Transcribir",
                },
            ],
        },
        {
            slug: "escribir",
            titulo: "La barra de escribir",
            resumen: "Escribe, usa respuestas rápidas, adjunta archivos y graba notas de voz.",
            icono: "PenLine",
            miniatura: "mini-escribir.webp",
            pasos: [
                {
                    titulo: "Escribe y envía",
                    texto: "Escribe abajo y pulsa la flecha, o Enter. Mayúsculas y Enter hace un salto de línea.",
                    imagen: "escribir-texto.webp",
                    alt: "Un mensaje escrito en la barra con la flecha de enviar",
                },
                {
                    titulo: "Respuestas rápidas con «/»",
                    texto: "Escribe «/» y la primera letra de un atajo, como «/h»: sale la respuesta rápida y su texto queda listo para enviar.",
                    imagen: "escribir-atajos.webp",
                    alt: "Las respuestas rápidas que salen al escribir la barra",
                },
                {
                    titulo: "El rayo: respuestas y flujos",
                    texto: "El rayo abre todas tus respuestas rápidas y, en Workflows, los flujos que puedes lanzar en esta conversación.",
                    imagen: "escribir-rapidas.webp",
                    alt: "El panel de atajos con las respuestas rápidas",
                },
                {
                    titulo: "Adjunta un archivo",
                    texto: "El clip manda una imagen, un documento o un audio. También puedes pegar una captura con Ctrl+V.",
                    imagen: "escribir-adjuntar.webp",
                    alt: "El menú del clip con Imagen, Documento y Audio",
                },
                {
                    titulo: "Dicta o graba",
                    texto: "La onda escribe lo que dices; el micrófono graba una nota de voz para enviarla tal cual.",
                    imagen: "escribir-voz.webp",
                    alt: "Los botones de dictar y grabar resaltados",
                },
            ],
        },
        {
            slug: "mas-de-la-barra",
            titulo: "La IA, la firma, las notas y las plantillas",
            resumen: "Encender o pausar la IA, firmar, dejar una nota interna y usar plantillas de Meta.",
            icono: "Bot",
            miniatura: "mini-mas-de-la-barra.webp",
            pasos: [
                {
                    titulo: "La IA de esta conversación",
                    texto:
                        "El interruptor de la izquierda: encendido, contesta la IA; apagado, la IA se pausa y atiendes tú. " +
                        "Cuando escribes tú, se pausa sola.",
                    imagen: "barra-ia.webp",
                    alt: "El interruptor de la IA encendido en la barra de escribir",
                },
                {
                    titulo: "La firma del asesor",
                    texto: "El lápiz pone tu nombre delante de cada mensaje que mandas, para que el cliente sepa quién le escribe.",
                    imagen: "barra-firma.webp",
                    alt: "El menú Firma del asesor abierto",
                },
                {
                    titulo: "Una nota interna",
                    texto: "El candado cambia la barra a nota interna: lo que escribes lo ve tu equipo y nunca le llega al cliente.",
                    imagen: "barra-nota.webp",
                    alt: "La barra de escribir en modo nota interna",
                },
                {
                    titulo: "Una respuesta sugerida",
                    texto: "El destello le pide a la IA una respuesta para lo último que dijo el cliente; la revisas y la envías.",
                    imagen: "barra-sugerencia.webp",
                    alt: "El botón de respuesta sugerida resaltado",
                },
                {
                    titulo: "Plantillas de WhatsApp oficial",
                    texto: "En una línea de WhatsApp oficial (Meta), el icono de plantillas manda una aprobada, incluso pasadas 24 horas.",
                    imagen: "barra-plantillas.webp",
                    alt: "La ventana de plantillas de WhatsApp abierta",
                },
            ],
            consejos: [
                "La nota interna se ve en amarillo entre los mensajes y también en la pestaña Notas.",
                "La respuesta sugerida y la traducción gastan créditos de IA de la cuenta.",
            ],
        },
        {
            slug: "ficha",
            titulo: "La ficha del contacto",
            resumen: "Sus datos, la IA, los participantes y sus notas, a la derecha.",
            icono: "Contact",
            miniatura: "mini-ficha.webp",
            pasos: [
                {
                    titulo: "Abre la ficha",
                    texto: "El último botón de la cabecera abre la ficha del contacto a la derecha, sin tapar la conversación.",
                    imagen: "ficha-abrir.webp",
                    alt: "El botón de la ficha del contacto resaltado",
                },
                {
                    titulo: "La IA y los participantes",
                    texto: "Arriba, el interruptor del agente IA de este contacto y quién más participa en la conversación.",
                    imagen: "ficha-arriba.webp",
                    alt: "La parte de arriba de la ficha con el agente IA y los participantes",
                },
                {
                    titulo: "Sus datos y sus notas",
                    texto: "Nombre, teléfono y los campos de tu cuenta; abajo, unas notas libres que se guardan solas.",
                    imagen: "ficha-datos.webp",
                    alt: "Los datos del contacto y sus notas en la ficha",
                },
            ],
            consejos: ["Qué campos lleva la ficha se configura con el icono de ajustes de su cabecera."],
        },
        {
            slug: "llamada",
            titulo: "Llamar desde el chat",
            resumen: "Llama por WhatsApp sin salir de la conversación, y anota cómo fue.",
            icono: "Phone",
            miniatura: "mini-llamada.webp",
            pasos: [
                {
                    titulo: "Pulsa el teléfono",
                    texto: "El teléfono verde de la cabecera: «Llamar» llama tú desde tu computador; «Llamar IA» llama el asistente de voz.",
                    imagen: "llamada-menu.webp",
                    alt: "El menú del teléfono con Llamar y Llamar IA",
                },
                {
                    titulo: "La llamada en curso",
                    texto: "Sale la tarjeta de la llamada con el tiempo que lleva. Puedes seguir escribiendo en el chat mientras hablas.",
                    imagen: "llamada-en-curso.webp",
                    alt: "La tarjeta de la llamada en curso con su tiempo",
                },
                {
                    titulo: "Silenciar, altavoz y plegar",
                    texto: "Silenciar apaga tu micrófono, Altavoz cambia por dónde suena, Colgar termina, y la flecha pliega la tarjeta a una barra pequeña que puedes mover.",
                    imagen: "llamada-mandos.webp",
                    alt: "Los mandos de la llamada resaltados",
                },
                {
                    titulo: "Anota cómo fue",
                    texto: "Si el cliente cuelga, la tarjeta pregunta cómo resultó: Interesado, Link enviado, Volver a llamar, No contesta o No interesado.",
                    imagen: "llamada-resultado.webp",
                    alt: "La tarjeta de la llamada terminada con los resultados",
                },
            ],
            consejos: ["La llamada queda en la conversación y en Llamadas, con su duración y su grabación."],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("chats", GUIA_CHATS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
