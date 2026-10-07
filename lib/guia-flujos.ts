/**
 * La GUÍA PÚBLICA de Crear flujos (`/guia/flujos`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que las demás guías (armada con `laGuiaDe`) y se pinta con
 * las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que pinta
 * la pantalla —los cuatro tipos con `lib/flujos-de-la-lista.ts`, la paleta del
 * editor con `types/workflow-node.ts`, los topes con `types/workflow.ts`—. Un
 * paso nuevo en la paleta sin su nombre aquí pone el banco en rojo, que es como
 * se evita que la guía describa una pantalla que ya no existe.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";
import { TIPOS_DE_FLUJO } from "@/lib/flujos-de-la-lista";
import { MAX_NODES_PER_WORKFLOW, MAX_SEGUIMIENTOS_PER_WORKFLOW } from "@/types/workflow";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Crear flujos en el menú. El banco lo compara con el menú sembrado. */
/**
 * El tope de un mensaje de texto. Es `MAX_MESSAGE_LENGTH` de `types/workflow-node.ts`,
 * que no se importa para no arrastrar la paleta entera (con sus iconos) a la
 * guía: el banco compara los dos números.
 */
export const LARGO_MAXIMO_DEL_MENSAJE = 1000;

export const MODULO_DE_FLUJOS = "Creación de Flujos";

/** Las cinco ZONAS de la pantalla, en el orden en que las numera «Todo en una pantalla». */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "La lista de tus flujos",
    "Una tarjeta, un flujo",
] as const;

/** Los cuatro tipos, con el nombre que enseñan las pastillas y la ventana de crear. */
export const TIPOS_DOCUMENTADOS = TIPOS_DE_FLUJO.map((t) => t.nombre);

/** Las opciones del «⋯» de una tarjeta, en su orden (`WorkflowAction.tsx`). */
export const MENU_DE_LA_TARJETA = ["Repeticiones", "Paso de embudo", "Usar como bienvenida", "Eliminar"] as const;

/**
 * La paleta del editor, grupo por grupo, con el nombre de cada paso tal como lo
 * pinta «Selecciona una acción». El banco la compara con `types/workflow-node.ts`.
 */
export const PALETA_DOCUMENTADA = {
    Nodos: ["Texto", "Imagen", "Video", "Documento", "Nota de voz"],
    Acciones: ["Pausar", "Notificar", "Intención", "Guardar ficha", "Menú de opciones", "Menú con botones"],
    Automatizaciones: [
        "Agregar tag",
        "Quitar tag",
        "Asignar asesor",
        "Agregar participante",
        "Crear tarea",
        "Notificar asesor",
        "Cambiar estado",
        "Activar / Desactivar IA",
        "Webhook externo",
        "Llamar con IA (voz)",
    ],
    Seguimientos: ["Texto", "Imagen", "Video", "Documento", "Nota de voz", "Llamada con IA"],
} as const;

export const GUIA_FLUJOS: Contenido = {
    titulo: "Crear flujos",
    subtitulo: "Respuestas automáticas, paso a paso, para tus chats de WhatsApp",
    descripcion:
        "Un flujo es una serie de mensajes y acciones que la plataforma hace sola: dar la bienvenida, contestar a una " +
        "palabra clave, mandar el catálogo, etiquetar al cliente o insistirle si no responde. Los armas en un editor " +
        "visual, juntando pasos como piezas, y se ponen en marcha sin que tengas que escribir cada vez.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo y la lista de tus flujos.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo · 4 La lista de tus flujos · 5 Una tarjeta, un flujo.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Crear flujos con sus cinco partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Crear flujos está dentro de Creación de Flujos. Al entrar a " +
                        "una pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Crear flujos dentro de Creación de Flujos",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La barra de trabajo",
                    texto:
                        "1 Buscador, por nombre o por palabra clave · 2 Los cuatro tipos de flujo, con cuántos tienes · " +
                        "3 El horario de los seguimientos · 4 Nuevo, para crear un flujo.",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con el buscador, los tipos, el horario y Nuevo numerados",
                },
                {
                    titulo: "Una tarjeta de flujo",
                    texto:
                        "1 Arrastrar, para cambiar el orden · 2 Abrir el editor · 3 El nombre y sus palabras clave · " +
                        "4 Editar · 5 Más acciones.",
                    imagen: "tarjeta.webp",
                    alt: "Una tarjeta de flujo con cada mando numerado",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas.",
                "Todo lo que hace un flujo lo hace por la línea de WhatsApp de la conversación.",
            ],
        },
        {
            slug: "tipos",
            titulo: "Los cuatro tipos de flujo",
            resumen: "Inicio, IA, Flujo y Chatbot: lo que cambia es qué lo pone en marcha.",
            icono: "Layers",
            miniatura: "mini-tipos.webp",
            pasos: [
                {
                    titulo: "Los tipos, en la barra",
                    texto:
                        "Cada pastilla dice cuántos flujos tienes de ese tipo. Púlsala y la lista se queda solo con " +
                        "ellos; vuelve a pulsarla para verlos todos.",
                    imagen: "tipos-pastillas.webp",
                    alt: "Las cuatro pastillas de tipo en la barra, con la de Chatbot puesta",
                },
                {
                    titulo: "Inicio: la bienvenida",
                    texto:
                        "Se envía solo a quien te escribe por primera vez. Lleva una casita delante del nombre, y solo " +
                        "puede haber uno.",
                    imagen: "tipo-inicio.webp",
                    alt: "La tarjeta del flujo de bienvenida, con la casita delante del nombre",
                },
                {
                    titulo: "IA: lo lanza la inteligencia artificial",
                    texto:
                        "Describes con tus palabras qué tiene que pedir el cliente, y la IA lo lanza cuando lo entiende. " +
                        "Debajo de la tarjeta sale su disparador, con un interruptor para encenderlo o apagarlo.",
                    imagen: "tipo-ia.webp",
                    alt: "La tarjeta de un flujo de IA con su disparador debajo",
                },
                {
                    titulo: "Chatbot: con una palabra clave",
                    texto:
                        "Se pone en marcha cuando el cliente escribe una de sus palabras clave. Salen debajo del nombre.",
                    imagen: "tipo-chatbot.webp",
                    alt: "La tarjeta de un flujo de Chatbot con sus palabras clave debajo del nombre",
                },
            ],
            consejos: [
                "Un Flujo a secas no se lanza solo: lo pone en marcha la IA desde sus instrucciones, o tú con una respuesta rápida.",
                "Un flujo de IA con palabras clave cuenta como de IA.",
            ],
        },
        {
            slug: "crear",
            titulo: "Crear un flujo",
            resumen: "Ponle nombre, elige el tipo y entras directo al editor.",
            icono: "PlusCircle",
            miniatura: "mini-crear.webp",
            pasos: [
                {
                    titulo: "Pulsa «Nuevo»",
                    texto: "Es el botón azul de la barra de trabajo. Se abre la ventana «Nuevo flujo».",
                    imagen: "crear-boton.webp",
                    alt: "El botón Nuevo resaltado en la barra de trabajo",
                },
                {
                    titulo: "Nombre y tipo",
                    texto:
                        "Escribe el nombre y elige el tipo. Según el tipo, la ventana te pide lo que le falta: la " +
                        "descripción para uno de IA, o las palabras clave para un Chatbot.",
                    imagen: "crear-ventana.webp",
                    alt: "La ventana Nuevo flujo con el nombre escrito y los cuatro tipos",
                },
                {
                    titulo: "Lo que pide cada tipo",
                    texto:
                        "Un Chatbot pide el tipo de coincidencia —Exacta o Contiene— y sus palabras clave: escribe una " +
                        "y pulsa Enter para añadirla.",
                    imagen: "crear-chatbot.webp",
                    alt: "La ventana con el tipo Chatbot elegido, la coincidencia y una palabra clave añadida",
                },
                {
                    titulo: "Pulsa «Crear»",
                    texto: "El flujo se crea y se abre el editor, listo para ponerle sus pasos.",
                    imagen: "crear-listo.webp",
                    alt: "El editor recién abierto de un flujo nuevo",
                },
            ],
            consejos: [
                "Un Chatbot admite hasta 20 palabras clave.",
                "Si creas otro flujo de Inicio, pasa a ser la bienvenida y el anterior deja de serlo.",
            ],
        },
        {
            slug: "palabras-clave",
            titulo: "Palabras clave y disparadores",
            resumen: "Cambia cuándo se lanza un flujo sin abrir el editor.",
            icono: "Tags",
            miniatura: "mini-palabras-clave.webp",
            pasos: [
                {
                    titulo: "Pulsa el nombre",
                    texto:
                        "En la tarjeta, pulsa el nombre o sus palabras clave: se abren ahí mismo el nombre, el tipo de " +
                        "coincidencia y las palabras.",
                    imagen: "palabras-editar.webp",
                    alt: "La tarjeta con el nombre y las palabras clave abiertos para editar",
                },
                {
                    titulo: "Añade o quita palabras",
                    texto:
                        "Escribe una palabra o frase y pulsa Enter para añadirla. La X de cada una la quita. Se guarda " +
                        "al salir del campo.",
                    imagen: "palabras-agregar.webp",
                    alt: "Una palabra clave nueva añadida a la tarjeta",
                },
                {
                    titulo: "El disparador de IA",
                    texto:
                        "En un flujo de IA, el disparador va debajo de la tarjeta. El interruptor lo enciende o lo " +
                        "apaga; el lápiz lo edita y la papelera lo quita.",
                    imagen: "disparador-ia.webp",
                    alt: "El disparador de IA de una tarjeta con su interruptor, el lápiz y la papelera",
                },
                {
                    titulo: "Edita lo que entiende la IA",
                    texto:
                        "En la descripción de la intención cuentas, como se lo dirías a una persona, qué tiene que " +
                        "pedir el cliente para que se lance el flujo.",
                    imagen: "disparador-editar.webp",
                    alt: "La ventana para editar el disparador con su nombre y la descripción de la intención",
                },
            ],
            consejos: [
                "Exacta se lanza si el mensaje es justo la palabra; Contiene, si la palabra está dentro del mensaje.",
                "Cuanto más clara la descripción del disparador, mejor acierta la IA.",
            ],
        },
        {
            slug: "el-editor",
            titulo: "El editor visual",
            resumen: "Los pasos del flujo, uno tras otro, unidos por líneas.",
            icono: "GitBranch",
            miniatura: "mini-el-editor.webp",
            pasos: [
                {
                    titulo: "Abre el editor",
                    texto:
                        "Pulsa «Editar» o el icono azul de la tarjeta. 1 Los pasos del flujo · 2 Ordenar · " +
                        "3 Agregar un paso · 4 Acercar, alejar y ver todo.",
                    imagen: "editor.webp",
                    alt: "El editor de un flujo con sus partes numeradas",
                },
                {
                    titulo: "Escribe en un paso",
                    texto:
                        "Pulsa el recuadro de un paso de texto y escribe el mensaje. Se guarda solo al salir del recuadro.",
                    imagen: "editor-texto.webp",
                    alt: "Un paso de texto abierto para escribir el mensaje",
                },
                {
                    titulo: "Más acciones de un paso",
                    texto: "Los tres puntos de cada paso abren su menú: «Eliminar nodo» lo quita del flujo.",
                    imagen: "editor-nodo-menu.webp",
                    alt: "El menú de los tres puntos de un paso abierto",
                },
                {
                    titulo: "Ordenar",
                    texto:
                        "Con muchos pasos, «Ordenar» los coloca en filas, de izquierda a derecha, para que se lean en " +
                        "el orden en que salen.",
                    imagen: "editor-ordenar.webp",
                    alt: "El botón Ordenar resaltado arriba del editor",
                },
            ],
            consejos: [
                "Los pasos salen en el orden de las líneas que los unen.",
                "Arrastra el fondo para moverte por el editor, y usa la rueda del ratón para acercar o alejar.",
            ],
        },
        {
            slug: "agregar-pasos",
            titulo: "Agregar pasos y acciones",
            resumen: "Mensajes, menús, pausas y avisos: cada paso es una pieza.",
            icono: "ListChecks",
            miniatura: "mini-agregar-pasos.webp",
            pasos: [
                {
                    titulo: "El «+» detrás del último paso",
                    texto:
                        "Pulsa el «+» que sale detrás del último paso y elige qué viene después. El paso nuevo queda " +
                        "unido al anterior.",
                    imagen: "agregar-mas.webp",
                    alt: "El panel Selecciona una acción abierto desde el «+» del último paso",
                },
                {
                    titulo: "Todos los pasos, por grupos",
                    texto:
                        "El «+» azul de arriba a la derecha abre todos los pasos: Nodos, que son mensajes; Acciones, que " +
                        "ordenan la conversación; Automatizaciones y Seguimientos.",
                    imagen: "agregar-paleta.webp",
                    alt: "La lista Selecciona una acción con sus grupos Nodos y Acciones resaltados",
                },
                {
                    titulo: "Un menú de opciones",
                    texto:
                        "Escribe la pregunta y las opciones, una por línea. Cada opción tiene su salida: lo que unas a " +
                        "ella es lo que pasa cuando el cliente la elige.",
                    imagen: "nodo-menu.webp",
                    alt: "Un paso Menú de opciones con sus salidas unidas a otros pasos",
                },
            ],
            consejos: [
                "Pausar detiene el flujo para que el cliente conteste antes de seguir.",
                "Notificar te avisa en la plataforma cuando el flujo llega a ese punto.",
                "El «Menú con botones» manda las opciones como lista para tocar, en vez de numeradas.",
            ],
        },
        {
            slug: "automatizaciones",
            titulo: "Automatizaciones",
            resumen: "Pasos que no le escriben al cliente: ordenan tu CRM por ti.",
            icono: "Zap",
            miniatura: "mini-automatizaciones.webp",
            pasos: [
                {
                    titulo: "El grupo Automatizaciones",
                    texto:
                        "Etiquetar, asignar un asesor, sumar un participante, crear una tarea, avisar al asesor, cambiar el estado, encender o " +
                        "apagar la IA, y más.",
                    imagen: "automatizaciones.webp",
                    alt: "El grupo Automatizaciones de la lista de pasos",
                },
                {
                    titulo: "Agregar tag",
                    texto: "Elige la etiqueta: cuando el flujo pasa por aquí, se le pone a la conversación.",
                    imagen: "auto-tag.webp",
                    alt: "Un paso Agregar tag con la etiqueta elegida",
                },
                {
                    titulo: "Notificar asesor",
                    texto:
                        "Le manda un aviso por WhatsApp al asesor de la conversación, o al dueño si no tiene asesor.",
                    imagen: "auto-notificar.webp",
                    alt: "Un paso Notificar asesor con su mensaje",
                },
            ],
            consejos: ["Las automatizaciones van en el mismo hilo que los mensajes: se hacen en el orden en que están."],
        },
        {
            slug: "seguimientos",
            titulo: "Seguimientos",
            resumen: "Mensajes que salen más tarde, si el cliente no responde.",
            icono: "History",
            miniatura: "mini-seguimientos.webp",
            pasos: [
                {
                    titulo: "Un seguimiento",
                    texto:
                        "Elige cuánto esperar —minutos, horas o días— y el mensaje. Con «Activar inactividad», solo se " +
                        "envía si el cliente no ha respondido.",
                    imagen: "seguimiento.webp",
                    alt: "Un paso de seguimiento con su espera y el interruptor de inactividad",
                },
                {
                    titulo: "Varios seguidos",
                    texto: "Pon varios seguidos para insistir a la hora, al día y a los tres días, cada uno con su mensaje.",
                    imagen: "seguimiento-cadena.webp",
                    alt: "Un flujo con varios seguimientos uno detrás de otro",
                },
                {
                    titulo: "El horario de envío",
                    texto:
                        "El calendario de la barra de trabajo decide a qué horas y qué días pueden salir los " +
                        "seguimientos, para no escribirle a nadie de madrugada.",
                    imagen: "horario.webp",
                    alt: "La ventana Horario de seguimientos con las horas y los días",
                },
            ],
            consejos: [
                "Un seguimiento puede esperar hasta 365 días.",
                "Lo que va después de un seguimiento sale cuando ese seguimiento sale.",
            ],
        },
        {
            slug: "mas-acciones",
            titulo: "Repeticiones, orden y eliminar",
            resumen: "Lo que haces con un flujo desde su tarjeta.",
            icono: "MoreHorizontal",
            miniatura: "mini-mas-acciones.webp",
            pasos: [
                {
                    titulo: "Más acciones",
                    texto:
                        "Los tres puntos de la tarjeta: Repeticiones, Paso de embudo, Usar como bienvenida y Eliminar.",
                    imagen: "tarjeta-menu.webp",
                    alt: "El menú de los tres puntos de una tarjeta abierto",
                },
                {
                    titulo: "Repeticiones",
                    texto:
                        "Por defecto un flujo sale una sola vez por conversación. Aquí eliges cuántas veces puede " +
                        "salir y cuánto esperar entre una y otra.",
                    imagen: "repeticiones.webp",
                    alt: "La ventana Repeticiones del flujo con el máximo y la espera",
                },
                {
                    titulo: "Arrastra para ordenar",
                    texto:
                        "Toma una tarjeta por los seis puntos de la izquierda y suéltala donde la quieras. Con una " +
                        "búsqueda o un tipo puesto no se puede: quítalos primero.",
                    imagen: "ordenar.webp",
                    alt: "El asa de arrastre de una tarjeta resaltada",
                },
                {
                    titulo: "Eliminar",
                    texto:
                        "Borra el flujo con todos sus pasos y archivos, y no se puede deshacer: por eso antes te pide " +
                        "que lo confirmes.",
                    imagen: "eliminar.webp",
                    alt: "La ventana que pide confirmar antes de eliminar el flujo",
                },
            ],
            consejos: [
                "«Paso de embudo» lo marca como un paso de tu embudo de ventas.",
                "Usar como bienvenida lo convierte en el flujo de Inicio; el que lo era deja de serlo.",
            ],
        },
        {
            slug: "limites",
            titulo: "Límites y tu plan",
            resumen: "Cuántos pasos caben en un flujo, y qué pasos incluye tu plan.",
            icono: "ShieldCheck",
            miniatura: "mini-limites.webp",
            pasos: [
                {
                    titulo: "Los contadores",
                    texto: `Arriba de la lista de pasos ves cuántos llevas. Un flujo admite hasta ${MAX_NODES_PER_WORKFLOW} pasos y hasta ${MAX_SEGUIMIENTOS_PER_WORKFLOW} seguimientos.`,
                    imagen: "limites-contadores.webp",
                    alt: "Los contadores de pasos y seguimientos arriba de la lista",
                },
                {
                    titulo: "Pasos con candado",
                    texto:
                        "Los pasos que tu plan no incluye salen en gris y con un candado. Si los necesitas, mejora tu plan.",
                    imagen: "limites-candados.webp",
                    alt: "Pasos en gris con un candado en la lista",
                },
                {
                    titulo: "El largo de un mensaje",
                    texto: `Cada mensaje admite hasta ${LARGO_MAXIMO_DEL_MENSAJE.toLocaleString("es-CO")} caracteres: si te pasas, el paso te avisa y no deja escribir más. Pártelo en dos pasos.`,
                    imagen: "limites-mensaje.webp",
                    alt: "El aviso de que el mensaje pasa del tope de caracteres",
                },
            ],
            consejos: [
                "Crear flujos depende de tu plan: si no lo ves en el menú, tu plan no lo incluye.",
                "Al llegar al tope de pasos, el editor te lo dice y no deja agregar más.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("flujos", GUIA_FLUJOS);

export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
