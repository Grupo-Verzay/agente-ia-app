/**
 * La GUÍA PÚBLICA de Calificación (`/guia/calificacion`): qué dice cada sección
 * y qué captura enseña cada paso. Puro: lo leen la página, el script que toma
 * las capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que pintan
 * `KanbanBoard.tsx`, `CrmDashboard.tsx`, `StageAutomationsPanel.tsx` y
 * `lib/etiquetas-de-la-pantalla.ts`. Una columna, un rango o una acción nueva en
 * la pantalla sin su nombre aquí pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Calificación en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_CALIFICACION = "Panel";

/** Las seis ZONAS de la pantalla, tal como las numera «Todo en una pantalla». */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Las pestañas del Panel",
    "La barra de trabajo",
    "La barra del tablero",
    "El tablero",
] as const;

/** Las seis columnas del tablero, en su orden. El banco las compara con `COLUMNS` de `KanbanBoard.tsx`. */
export const COLUMNAS_DOCUMENTADAS = ["Sin clasificar", "Frío", "Tibio", "Caliente", "Finalizado", "Descartado"] as const;

/** La primera columna: la única sin automatizaciones, porque ahí no se entra arrastrando a una etapa. */
export const COLUMNA_SIN_CLASIFICAR = "Sin clasificar";

/** Los cinco rangos del filtro por puntaje. El banco los compara con `RANGOS_DE_PUNTAJE`. */
export const RANGOS_DOCUMENTADOS = [
    { nombre: "Bajo", tramo: "0–25" },
    { nombre: "Medio", tramo: "26–50" },
    { nombre: "Moderado", tramo: "51–75" },
    { nombre: "Alto", tramo: "76–90" },
    { nombre: "Listo", tramo: "91–100" },
] as const;

/** Las pestañas del CRM que lleva la barra de trabajo (`CrmDashboard.tsx`, `pestanas-del-crm`). */
export const PESTANAS_DEL_CRM = ["Analíticas", "Registros", "Llamadas", "Kanban", "Reportes", "Calidad"] as const;

/** Las partes de la barra de trabajo, con su `data-zona` (`CrmDashboard.tsx`). */
export const PARTES_DE_LA_BARRA_DE_TRABAJO = [
    { nombre: "Las pestañas del CRM", zona: "pestanas-del-crm" },
    { nombre: "El filtro por puntaje", zona: "filtro-de-puntaje" },
] as const;

/** Las partes de la barra del tablero, con su `data-zona` (`KanbanBoard.tsx`). */
export const PARTES_DE_LA_BARRA_DEL_TABLERO = [
    { nombre: "Buscar contacto", zona: "buscador" },
    { nombre: "Cuántos contactos", zona: "contador" },
    { nombre: "Actualizar", zona: "actualizar" },
    { nombre: "Calificar con IA", zona: "puntuar-todos" },
] as const;

/** Los mandos de la cabecera de una columna, con su `data-zona`. */
export const PARTES_DE_UNA_COLUMNA = [
    { nombre: "Cuántos contactos tiene", zona: "cuantos" },
    { nombre: "Automatizaciones", zona: "automatizaciones" },
] as const;

/** Las partes de una tarjeta, en su orden, con su `data-zona` (`KanbanCardItem`). */
export const PARTES_DE_UNA_TARJETA = [
    { nombre: "El nombre y su número", zona: "contacto" },
    { nombre: "El puntaje de la IA", zona: "puntaje" },
    { nombre: "Seguimientos pendientes", zona: "seguimientos" },
    { nombre: "Tiempo en la columna", zona: "tiempo" },
    { nombre: "Calificar con IA", zona: "puntuar" },
    { nombre: "Por qué tiene ese puntaje", zona: "motivo" },
    { nombre: "Por qué está en esa columna", zona: "razon" },
    { nombre: "Sus etiquetas", zona: "etiquetas" },
] as const;

/** Los tipos de acción de una automatización. El banco los compara con `ACTION_TYPES` (`StageAutomationsPanel.tsx`). */
export const ACCIONES_DE_UNA_AUTOMATIZACION = [
    "Agregar tag",
    "Quitar tag",
    "Asignar asesor",
    "Crear tarea",
    "Ejecutar flujo",
    "Enviar mensaje",
    "Recordatorio",
    "Notificar asesor",
    "Activar / Desactivar IA",
    "Enviar archivo",
    "Webhook externo",
    "Cambiar estado lead",
    "Llamar con IA (voz)",
] as const;

export const GUIA_CALIFICACION: Contenido = {
    titulo: "Calificación",
    subtitulo: "Tus contactos ordenados de fríos a listos para comprar",
    descripcion:
        "Calificación reparte tus contactos en un tablero por etapa: Sin clasificar, Frío, Tibio, Caliente, " +
        "Finalizado y Descartado. Los mueves arrastrando, la IA les pone un puntaje del 0 al 100 según lo que han " +
        "hablado contigo, filtras para ver solo a los que están listos, y cada etapa puede hacer cosas sola cuando " +
        "un contacto entra en ella.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, las pestañas del Panel, las dos barras y el tablero.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba · 3 Las pestañas del Panel · 4 La barra de " +
                        "trabajo · 5 La barra del tablero · 6 El tablero.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Calificación con sus seis partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Calificación está dentro de Panel. Al entrar a una " +
                        "pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Calificación dentro de Panel",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "Las pestañas del Panel",
                    texto:
                        "Calificación es una pestaña del Panel, junto a Embudos, Catálogo, Proyectos y las demás: " +
                        "pasas de una a otra sin volver al menú.",
                    imagen: "pestanas.webp",
                    alt: "Las pestañas del Panel con Calificación señalada",
                },
                {
                    titulo: "La barra de trabajo",
                    texto:
                        "1 Las pestañas del CRM: Kanban es este tablero · 2 El filtro por puntaje, con sus cinco rangos.",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con sus dos partes numeradas",
                },
                {
                    titulo: "La barra del tablero",
                    texto: "1 Buscar contacto, por nombre o número · 2 Cuántos contactos hay · 3 Actualizar · 4 Calificar con IA.",
                    imagen: "barra-del-tablero.webp",
                    alt: "La barra del tablero con el buscador, el contador y sus botones numerados",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Calificación por Panel.",
                "La etapa de un contacto es la misma que ves en Chats y en Leads: lo que cambies aquí se ve en todas partes.",
            ],
        },
        {
            slug: "el-tablero",
            titulo: "El tablero",
            resumen: "Seis columnas, una por etapa, y una tarjeta por contacto con su puntaje.",
            icono: "Columns3",
            miniatura: "mini-el-tablero.webp",
            pasos: [
                {
                    titulo: "Seis columnas",
                    texto:
                        "Sin clasificar, Frío, Tibio, Caliente, Finalizado y Descartado. Un contacto nuevo empieza en " +
                        "Sin clasificar y avanza según cómo va la conversación.",
                    imagen: "columnas.webp",
                    alt: "El tablero con sus seis columnas",
                },
                {
                    titulo: "La cabecera de una columna",
                    texto: "1 Cuántos contactos tiene · 2 Sus automatizaciones. Sin clasificar no lleva automatizaciones.",
                    imagen: "cabecera-de-columna.webp",
                    alt: "La cabecera de una columna con sus mandos numerados",
                },
                {
                    titulo: "Una tarjeta",
                    texto:
                        "1 Nombre y número, que abre el chat · 2 Puntaje · 3 Seguimientos pendientes · 4 Tiempo en la " +
                        "columna · 5 Calificar con IA · 6 Motivo del puntaje · 7 Por qué está ahí · 8 Etiquetas.",
                    imagen: "tarjeta.webp",
                    alt: "Una tarjeta del tablero con cada parte numerada",
                },
            ],
            consejos: [
                "Pulsar el número de una tarjeta abre su conversación en Chats.",
                "La campana amarilla cuenta los seguimientos que la IA tiene programados para ese contacto.",
            ],
        },
        {
            slug: "buscar",
            titulo: "Buscar un contacto",
            resumen: "Encuentra a alguien por su nombre o su número, en cualquier columna.",
            icono: "Search",
            miniatura: "mini-buscar.webp",
            pasos: [
                {
                    titulo: "Escribe en el buscador",
                    texto: "Escribe parte del nombre o del número. El tablero deja solo a los que coinciden, en su columna.",
                    imagen: "buscar-escribir.webp",
                    alt: "El buscador con un nombre escrito y el tablero filtrado",
                },
                {
                    titulo: "El contador lo dice",
                    texto: "Al lado se lee cuántos ves de cuántos hay en total, por ejemplo 1/12.",
                    imagen: "buscar-contador.webp",
                    alt: "El contador con los contactos que se ven de los que hay",
                },
                {
                    titulo: "Borra la búsqueda",
                    texto: "La X del buscador lo vacía y vuelve el tablero entero.",
                    imagen: "buscar-borrar.webp",
                    alt: "La X para borrar la búsqueda resaltada",
                },
            ],
            consejos: ["La búsqueda se suma al filtro por puntaje: puedes buscar un nombre dentro de los Listos."],
        },
        {
            slug: "arrastrar",
            titulo: "Mover un contacto de etapa",
            resumen: "Arrastra la tarjeta a otra columna y su etapa cambia sola.",
            icono: "ArrowLeftRight",
            miniatura: "mini-arrastrar.webp",
            pasos: [
                {
                    titulo: "Agarra la tarjeta",
                    texto: "Mantén pulsada la tarjeta y muévela: la ves flotar mientras la llevas.",
                    imagen: "arrastrar-agarrar.webp",
                    alt: "Una tarjeta levantada mientras se arrastra",
                },
                {
                    titulo: "Suéltala en otra columna",
                    texto: "Al soltarla, el contacto toma la etapa de esa columna. Se guarda al instante y vuelve a contar el tiempo.",
                    imagen: "arrastrar-soltar.webp",
                    alt: "La tarjeta ya en la columna de su nueva etapa",
                },
                {
                    titulo: "Descartado cancela sus seguimientos",
                    texto:
                        "Llevar un contacto a Descartado borra los seguimientos y recordatorios que tenía pendientes: " +
                        "la IA deja de escribirle.",
                    imagen: "arrastrar-descartado.webp",
                    alt: "Una tarjeta soltada en la columna Descartado, ya sin seguimientos",
                },
            ],
            consejos: [
                "Si la columna tiene automatizaciones, mover un contacto a ella las dispara.",
                "Si algo falla al guardar, la tarjeta vuelve a su sitio y te lo dice.",
            ],
        },
        {
            slug: "calificar-con-ia",
            titulo: "Calificar con IA",
            resumen: "La IA lee lo que ha hablado cada contacto y le pone un puntaje del 0 al 100.",
            icono: "Sparkles",
            miniatura: "mini-calificar-con-ia.webp",
            pasos: [
                {
                    titulo: "Un contacto",
                    texto: "El destello de una tarjeta califica a ese contacto. En unos segundos aparece su puntaje.",
                    imagen: "calificar-uno.webp",
                    alt: "El botón de calificar con IA de una tarjeta resaltado",
                },
                {
                    titulo: "Su puntaje y el porqué",
                    texto:
                        "El número sale con el color de su rango, y debajo una frase corta con el motivo: lo que vio " +
                        "la IA en la conversación.",
                    imagen: "calificar-resultado.webp",
                    alt: "La tarjeta con su puntaje nuevo y el motivo debajo",
                },
                {
                    titulo: "Todos a la vez",
                    texto:
                        "«Calificar con IA», arriba del tablero, califica de una vez a los que no se calificaron en el " +
                        "último día y te dice cuántos.",
                    imagen: "calificar-todos.webp",
                    alt: "El botón Calificar con IA de la barra del tablero y el aviso de cuántos se calificaron",
                },
            ],
            consejos: [
                "La IA califica con el resumen de la conversación, los reportes y las llamadas del contacto: uno sin nada de eso no se puede calificar.",
                "Cada calificación usa créditos de IA de tu cuenta. Sin créditos, te avisa y no califica.",
                "El puntaje no mueve la tarjeta de columna: la etapa la decides tú, o tus automatizaciones.",
            ],
        },
        {
            slug: "filtrar-por-puntaje",
            titulo: "Filtrar por puntaje",
            resumen: "Ve solo a los contactos de un rango: de los fríos a los listos para comprar.",
            icono: "TrendingUp",
            miniatura: "mini-filtrar-por-puntaje.webp",
            pasos: [
                {
                    titulo: "Los cinco rangos",
                    texto:
                        "Bajo (0–25), Medio (26–50), Moderado (51–75), Alto (76–90) y Listo (91–100). Cada uno dice " +
                        "cuántos contactos tiene.",
                    imagen: "filtro-rangos.webp",
                    alt: "Los cinco rangos del filtro por puntaje con su número",
                },
                {
                    titulo: "Elige uno",
                    texto: "Al pulsarlo, el tablero deja solo a los contactos de ese rango, cada uno en su columna.",
                    imagen: "filtro-puesto.webp",
                    alt: "El tablero filtrado por el rango Alto",
                },
                {
                    titulo: "Quita el filtro",
                    texto: "Pulsa otra vez el mismo rango y vuelve el tablero entero.",
                    imagen: "filtro-quitar.webp",
                    alt: "El rango puesto resaltado, listo para quitarlo con otro clic",
                },
            ],
            consejos: ["Los contactos sin calificar no salen en ningún rango: califícalos primero con la IA."],
        },
        {
            slug: "automatizaciones",
            titulo: "Automatizaciones por etapa",
            resumen: "Lo que pasa solo cuando un contacto entra en una columna.",
            icono: "Workflow",
            miniatura: "mini-automatizaciones.webp",
            pasos: [
                {
                    titulo: "Abre el engranaje",
                    texto: "El engranaje de la cabecera de una columna abre sus automatizaciones, a la derecha.",
                    imagen: "automatizaciones-abrir.webp",
                    alt: "El engranaje de la columna Caliente resaltado",
                },
                {
                    titulo: "Crea una",
                    texto: "Escribe su nombre abajo y pulsa Crear. Queda encendida, lista para agregarle acciones.",
                    imagen: "automatizaciones-crear.webp",
                    alt: "El campo para el nombre de la automatización y el botón Crear",
                },
                {
                    titulo: "Agrega sus acciones",
                    texto:
                        "«Agregar acción» elige qué hacer —enviar un mensaje, poner una etiqueta, asignar un asesor, " +
                        "crear una tarea, lanzar un flujo…— y cuántos minutos esperar antes.",
                    imagen: "automatizaciones-accion.webp",
                    alt: "La ventana Nueva acción con el tipo de acción y la espera",
                },
                {
                    titulo: "Enciéndela o apágala",
                    texto:
                        "1 El interruptor la enciende o la apaga sin borrarla · 2 Cada acción, con su lápiz para " +
                        "cambiarla · 3 La papelera la borra.",
                    imagen: "automatizaciones-lista.webp",
                    alt: "Una automatización con su interruptor, sus acciones y su papelera numerados",
                },
            ],
            consejos: [
                "Una automatización corre cada vez que un contacto entra en esa columna, la muevas tú o la IA.",
                "Puedes tener varias en la misma columna: corren todas, cada una con sus acciones en orden.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("calificacion", GUIA_CALIFICACION);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
