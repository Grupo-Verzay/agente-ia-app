/**
 * La GUÍA PÚBLICA de Proyectos (`/guia/proyectos`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que pinta
 * `/proyectos` (`ProjectsClient.tsx`, el tablero `ProjectBoard.tsx` y su
 * tarjeta `TarjetaDeProyecto.tsx`) y con `lib/project-types.ts`,
 * `lib/task-types.ts` y `lib/vencimiento.ts`. Una columna, un estado o un campo
 * nuevo sin su nombre aquí pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";
import { BOARD_COLUMNS, PROJECT_STATUS_LABELS, PROJECT_STATUSES } from "@/lib/project-types";
import { TASK_TYPES } from "@/lib/task-types";
import { ETIQUETAS_DE_FILTRO, FILTROS_DE_VENCIMIENTO } from "@/lib/vencimiento";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Proyectos en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_PROYECTOS = "Panel";

/** Las ZONAS de la pantalla, en el orden en que se leen. */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Las pestañas del Panel",
    "La barra de trabajo",
    "Tus proyectos",
] as const;

/**
 * Las partes de la BARRA DE TRABAJO, en su orden, con el `data-zona` (o el hueco
 * de `BarraDeAcciones`) donde vive cada una en `ProjectsClient.tsx`.
 */
export const PARTES_DE_LA_BARRA_DE_TRABAJO = [
    { nombre: "Buscador", zona: "buscador" },
    { nombre: "Estado y responsable", zona: "estado-y-responsable" },
    { nombre: "Las cifras", zona: "cifras" },
    { nombre: "Las carpetas", zona: "carpetas" },
    { nombre: "Nuevo", zona: "crear" },
] as const;

/** Los estados de un proyecto, en su orden. Son los de la pantalla. */
export const ESTADOS_DOCUMENTADOS = PROJECT_STATUSES.map((s) => PROJECT_STATUS_LABELS[s]);
/** Las opciones del filtro «Responsable» (`RESPONSABLES` de `ProjectsClient.tsx`). */
export const RESPONSABLES_DOCUMENTADOS = ["Del equipo", "Míos"] as const;
/** Las cifras de la barra, en su orden (las `etiqueta` de `PastillasDeMetricas`). */
export const CIFRAS_DOCUMENTADAS = ["Proyectos activos", "Tareas vencidas", "Esperando revisión", "Tareas abiertas"] as const;

/** Las partes de UNA tarjeta de proyecto, con su `data-zona` (`ProjectsClient.tsx`). */
export const PARTES_DE_UN_PROYECTO = [
    { nombre: "Nombre", zona: "nombre" },
    { nombre: "Estado", zona: "estado" },
    { nombre: "Tareas por columna", zona: "etapas" },
    { nombre: "Equipo", zona: "equipo" },
    { nombre: "Vencimiento", zona: "vence" },
] as const;

/** Los botones que salen al pasar el ratón por una tarjeta, en su orden (los `title`). */
export const MANDOS_DE_UN_PROYECTO = ["Mover a una carpeta", "Compartir con otras cuentas", "Eliminar", "Editar"] as const;

/** Los campos de «Nuevo proyecto», en su orden (`data-campo` de `ProjectDialog`). */
export const CAMPOS_DEL_PROYECTO = [
    { nombre: "Nombre", campo: "nombre" },
    { nombre: "Descripción", campo: "descripcion" },
    { nombre: "Estado", campo: "estado" },
    { nombre: "Fecha límite", campo: "fecha" },
    { nombre: "Responsable", campo: "responsable" },
    { nombre: "Equipo", campo: "equipo" },
] as const;

/** Las columnas del tablero, en su orden. Son las de `BOARD_COLUMNS`, no una copia. */
export const COLUMNAS_DOCUMENTADAS = BOARD_COLUMNS.map((c) => c.label);
/** Los tipos de tarea de fábrica. */
export const TIPOS_DOCUMENTADOS = TASK_TYPES;
/** El filtro de vencimiento del tablero, en su orden. */
export const FILTROS_DOCUMENTADOS = FILTROS_DE_VENCIMIENTO.map((f) => ETIQUETAS_DE_FILTRO[f]);

/** Las partes de UNA tarjeta de tarea, con su `data-zona` (`TarjetaDeProyecto.tsx`). */
export const PARTES_DE_UNA_TAREA = [
    { nombre: "Título", zona: "titulo" },
    { nombre: "Tipo", zona: "tipo" },
    { nombre: "Vencimiento", zona: "vencimiento" },
    { nombre: "Responsable", zona: "responsable" },
    { nombre: "Adjuntos", zona: "adjuntos" },
] as const;

/** Los campos de la ventana de una tarea, en su orden (`data-campo` de `TaskDialog`). */
export const CAMPOS_DE_LA_TAREA = [
    { nombre: "Título", campo: "titulo" },
    { nombre: "Qué hay que hacer", campo: "detalle" },
    { nombre: "Tipo", campo: "tipo" },
    { nombre: "Para cuándo", campo: "fecha" },
    { nombre: "Adjuntos", campo: "adjuntos" },
    { nombre: "Comentarios", campo: "comentarios" },
    { nombre: "Responsable", campo: "responsable" },
] as const;

/** Las cuatro formas de adjuntar (los botones de `BloqueDeAdjuntos`). */
export const ADJUNTOS_DOCUMENTADOS = ["Imagen", "Video", "Audio", "Doc."] as const;

const enLinea = (lista: readonly string[]) => lista.map((x, i) => `${i + 1} ${x}`).join(" · ");

export const GUIA_PROYECTOS: Contenido = {
    titulo: "Proyectos",
    subtitulo: "Tus proyectos y sus tareas, en un tablero por columnas",
    descripcion:
        "Proyectos reúne el trabajo de tu equipo: cada proyecto tiene su responsable, su fecha límite y un tablero " +
        "con sus tareas repartidas en columnas —por hacer, en curso, en revisión, hecho y cancelado—. Buscas, " +
        "filtras y ordenas tus proyectos en carpetas, y cada tarea lleva su tipo, su fecha, su responsable, sus " +
        "archivos y una conversación propia.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, las pestañas de Panel, la barra de trabajo y tus proyectos.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 Las pestañas del Panel, con Proyectos marcada · 4 La barra de trabajo · 5 Tus proyectos.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Proyectos con sus cinco partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Proyectos está dentro de Panel: arriba salen sus pestañas. " +
                        "Al entrar a una pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Proyectos dentro de Panel",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La barra de trabajo",
                    texto: enLinea(PARTES_DE_LA_BARRA_DE_TRABAJO.map((p) => p.nombre)) + ".",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con cada parte numerada",
                },
                {
                    titulo: "Cada tarjeta es un proyecto",
                    texto:
                        enLinea(PARTES_DE_UN_PROYECTO.map((p) => p.nombre)) +
                        ". La barra de colores dice dónde está el trabajo, no solo cuánto falta.",
                    imagen: "tarjeta.webp",
                    alt: "Una tarjeta de proyecto con cada parte numerada",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Proyectos por Panel.",
                "Pulsar una tarjeta abre el tablero de ese proyecto.",
            ],
        },
        {
            slug: "buscar-y-filtrar",
            titulo: "Buscar y filtrar",
            resumen: "Encontrar un proyecto por su nombre, su estado o su responsable.",
            icono: "Search",
            miniatura: "mini-buscar-y-filtrar.webp",
            pasos: [
                {
                    titulo: "El buscador",
                    texto: "Escribe parte del nombre o de la descripción y la lista se queda con los proyectos que coinciden.",
                    imagen: "buscar.webp",
                    alt: "El buscador con un texto escrito y la lista filtrada",
                },
                {
                    titulo: "Por estado",
                    texto: `El desplegable de estado deja Todos o solo ${ESTADOS_DOCUMENTADOS.join(", ")}.`,
                    imagen: "filtro-estado.webp",
                    alt: "El desplegable de estado abierto con sus opciones",
                },
                {
                    titulo: "Por responsable",
                    texto: `${RESPONSABLES_DOCUMENTADOS.join(" o ")}: con «Míos» ves solo los proyectos que llevas tú.`,
                    imagen: "filtro-responsable.webp",
                    alt: "El desplegable de responsable abierto",
                },
                {
                    titulo: "Las cifras",
                    texto:
                        enLinea(CIFRAS_DOCUMENTADAS) +
                        ". Pulsar «Proyectos activos» deja solo los activos; pasa el ratón por cada una para ver qué cuenta.",
                    imagen: "cifras.webp",
                    alt: "Las cuatro cifras de la barra de trabajo",
                },
            ],
            consejos: ["Si la lista sale vacía, quita los filtros: el mensaje te dice que nada coincide con la búsqueda."],
        },
        {
            slug: "carpetas-y-orden",
            titulo: "Carpetas y orden",
            resumen: "Agrupar los proyectos y ponerlos en el orden que te sirva.",
            icono: "FolderOpen",
            miniatura: "mini-carpetas-y-orden.webp",
            pasos: [
                {
                    titulo: "Las carpetas",
                    texto:
                        "Cada carpeta es un botón con su número. Pulsa una para ver solo sus proyectos, y «Todas» para " +
                        "volver. «Nueva carpeta» crea otra.",
                    imagen: "carpetas.webp",
                    alt: "La barra de carpetas con Todas, Clientes e Interno",
                },
                {
                    titulo: "Meter un proyecto en una carpeta",
                    texto: "Pasa el ratón por la tarjeta y pulsa el icono de carpeta: eliges a cuál va, o lo sacas.",
                    imagen: "mover-a-carpeta.webp",
                    alt: "El menú Mover a carpeta abierto sobre una tarjeta",
                },
                {
                    titulo: "Ordenar arrastrando",
                    texto:
                        "Agarra una tarjeta por el asa de la esquina y suéltala donde quieras. El orden se guarda para " +
                        "toda la cuenta.",
                    imagen: "ordenar.webp",
                    alt: "El asa de una tarjeta para cambiarla de sitio",
                },
            ],
            consejos: [
                "Borrar una carpeta no borra sus proyectos: vuelven a salir sueltos.",
                "Con una búsqueda puesta el orden se respeta: lo escondido conserva su sitio.",
            ],
        },
        {
            slug: "crear",
            titulo: "Crear un proyecto",
            resumen: "Nombre, estado, fecha límite, responsable y equipo.",
            icono: "PlusCircle",
            miniatura: "mini-crear.webp",
            pasos: [
                {
                    titulo: "El botón «Nuevo»",
                    texto: "A la derecha de la barra de trabajo. Abre la ventana «Nuevo proyecto».",
                    imagen: "crear-boton.webp",
                    alt: "El botón Nuevo de la barra de trabajo resaltado",
                },
                {
                    titulo: "Los datos",
                    texto:
                        enLinea(CAMPOS_DEL_PROYECTO.map((c) => c.nombre)) +
                        ". Solo el nombre es obligatorio.",
                    imagen: "crear-ventana.webp",
                    alt: "La ventana Nuevo proyecto con sus campos numerados",
                },
                {
                    titulo: "El equipo",
                    texto:
                        "Marca a las personas que trabajan en él: verán el proyecto y podrán llevar sus tareas.",
                    imagen: "crear-equipo.webp",
                    alt: "La lista de personas del equipo con varias marcadas",
                },
                {
                    titulo: "Pulsa «Crear proyecto»",
                    texto: "El proyecto aparece en la lista, listo para abrir su tablero y repartir tareas.",
                    imagen: "crear-listo.webp",
                    alt: "El proyecto recién creado en la lista",
                },
            ],
            consejos: ["El responsable es quien da cuenta del proyecto; el equipo, quienes trabajan en él."],
        },
        {
            slug: "editar-compartir-eliminar",
            titulo: "Editar, compartir o eliminar",
            resumen: "Los botones de cada tarjeta, al pasar el ratón.",
            icono: "PenLine",
            miniatura: "mini-editar-compartir-eliminar.webp",
            pasos: [
                {
                    titulo: "Los botones de la tarjeta",
                    texto: enLinea(MANDOS_DE_UN_PROYECTO) + ". Salen al pasar el ratón por la tarjeta.",
                    imagen: "mandos.webp",
                    alt: "Los cuatro botones de una tarjeta numerados",
                },
                {
                    titulo: "Editar",
                    texto: "El lápiz abre la ventana «Editar proyecto» con sus datos. Cambia lo que haga falta y pulsa «Guardar».",
                    imagen: "editar.webp",
                    alt: "La ventana Editar proyecto",
                },
                {
                    titulo: "Compartir con otra cuenta",
                    texto:
                        "Elige con qué cuentas lo compartes y si pueden solo verlo o también crear, mover y cerrar tareas. " +
                        "Trabajan sobre el mismo proyecto, no sobre una copia.",
                    imagen: "compartir.webp",
                    alt: "La ventana para compartir el proyecto con otras cuentas",
                },
                {
                    titulo: "Eliminar",
                    texto:
                        "La papelera pide confirmación. Las tareas del proyecto no se borran: se quedan sueltas en Mis tareas.",
                    imagen: "eliminar.webp",
                    alt: "La confirmación para eliminar un proyecto",
                },
            ],
            consejos: ["Solo quien manda en el proyecto ve Compartir, Editar y Eliminar."],
        },
        {
            slug: "tablero",
            titulo: "El tablero por columnas",
            resumen: "Las tareas del proyecto, de Por hacer a Hecho.",
            icono: "Kanban",
            miniatura: "mini-tablero.webp",
            pasos: [
                {
                    titulo: "Abrir el tablero",
                    texto:
                        `Pulsa una tarjeta. Las tareas se reparten en ${COLUMNAS_DOCUMENTADAS.length} columnas: ` +
                        COLUMNAS_DOCUMENTADAS.join(", ") +
                        ". La flecha de la izquierda vuelve a la lista.",
                    imagen: "tablero.webp",
                    alt: "El tablero de un proyecto con sus cinco columnas",
                },
                {
                    titulo: "Crear una tarea",
                    texto:
                        "«Nueva tarea» arriba a la derecha, o el «+» de una columna para que nazca directamente en ella.",
                    imagen: "tablero-nueva.webp",
                    alt: "El botón Nueva tarea y el + de una columna resaltados",
                },
                {
                    titulo: "Moverla de columna",
                    texto:
                        "Arrastra la tarjeta a otra columna. Al soltarla en «Hecho» se abre «Dar por hecha», que te pide cuánto tiempo tomó, y así " +
                        "queda contado el trabajo.",
                    imagen: "tablero-hecho.webp",
                    alt: "La ventana Dar por hecha al soltar una tarea en Hecho",
                },
                {
                    titulo: "Ordenar dentro de una columna",
                    texto: "Arrástrala arriba o abajo dentro de su columna: lo más urgente, arriba.",
                    imagen: "tablero-orden.webp",
                    alt: "Una columna con sus tarjetas en el orden elegido",
                },
            ],
            consejos: ["Un día de trabajo son ocho horas, no veinticuatro."],
        },
        {
            slug: "vencimiento",
            titulo: "Las fechas y el filtro de vencimiento",
            resumen: "Qué vence hoy, qué se pasó y qué vence esta semana.",
            icono: "CalendarClock",
            miniatura: "mini-vencimiento.webp",
            pasos: [
                {
                    titulo: "El color de la fecha",
                    texto:
                        "Cada tarea lleva su fecha: gris si falta más de un día, ámbar si vence hoy o mañana, y rojo si ya " +
                        "se pasó. Lo hecho o cancelado no se colorea.",
                    imagen: "vencimiento-colores.webp",
                    alt: "Tarjetas con la fecha en gris, ámbar y rojo",
                },
                {
                    titulo: "El filtro",
                    texto: `El desplegable de arriba: ${FILTROS_DOCUMENTADOS.join(", ")}.`,
                    imagen: "vencimiento-filtro.webp",
                    alt: "El filtro de vencimiento abierto con sus tres opciones",
                },
                {
                    titulo: "Solo vencidas",
                    texto: "El tablero se queda con lo que se pasó de fecha y no está hecho: lo que hay que atender ya.",
                    imagen: "vencimiento-vencidas.webp",
                    alt: "El tablero con el filtro Solo vencidas puesto",
                },
            ],
            consejos: [
                "La víspera y el mismo día te avisa la campanita de lo que vence.",
                "Con un filtro puesto no se reordena una columna: quítalo primero.",
            ],
        },
        {
            slug: "tarea",
            titulo: "La tarjeta de una tarea",
            resumen: "Título, tipo, fecha y responsable, de un vistazo y al abrirla.",
            icono: "ClipboardList",
            miniatura: "mini-tarea.webp",
            pasos: [
                {
                    titulo: "Una tarjeta",
                    texto: enLinea(PARTES_DE_UNA_TAREA.map((p) => p.nombre)) + ". El clip dice cuántos archivos lleva.",
                    imagen: "tarea-tarjeta.webp",
                    alt: "Una tarjeta de tarea con cada parte numerada",
                },
                {
                    titulo: "Abrirla",
                    texto:
                        "Pulsa la tarjeta: " + enLinea(CAMPOS_DE_LA_TAREA.slice(0, 5).map((c) => c.nombre)) + ". Más abajo están los comentarios y el responsable.",
                    imagen: "tarea-ventana.webp",
                    alt: "La ventana de una tarea con sus campos numerados",
                },
                {
                    titulo: "Tipo y fecha",
                    texto: `Los tipos de fábrica son ${TIPOS_DOCUMENTADOS.join(", ")}. «Para cuándo» decide el color de la tarjeta.`,
                    imagen: "tarea-tipo.webp",
                    alt: "El tipo y la fecha de la tarea resaltados",
                },
                {
                    titulo: "El responsable",
                    texto: "Elige quién la lleva. A esa persona le salta el aviso de que tiene una tarea nueva.",
                    imagen: "tarea-responsable.webp",
                    alt: "El desplegable de responsable de la tarea",
                },
            ],
            consejos: ["El título va corto; el detalle largo va en «Qué hay que hacer»."],
        },
        {
            slug: "adjuntos-y-comentarios",
            titulo: "Archivos y comentarios",
            resumen: "Lo que acompaña a la tarea y la conversación del equipo sobre ella.",
            icono: "Paperclip",
            miniatura: "mini-adjuntos-y-comentarios.webp",
            pasos: [
                {
                    titulo: "Adjuntar",
                    texto:
                        `${ADJUNTOS_DOCUMENTADOS.join(", ")} (documento): elige el archivo, arrástralo a la caja o pega una captura con Ctrl+V.`,
                    imagen: "adjuntos.webp",
                    alt: "La sección de adjuntos con una imagen y un PDF",
                },
                {
                    titulo: "Los comentarios",
                    texto:
                        "Cada tarea tiene su conversación. Escribe y se envía al guardar la tarea; le llega un aviso a quien " +
                        "la creó, a quien la lleva y a quien ya comentó.",
                    imagen: "comentarios.webp",
                    alt: "El hilo de comentarios de la tarea",
                },
                {
                    titulo: "Eliminar una tarea",
                    texto: "«Eliminar» abajo pide confirmación: se borra con sus comentarios y no se puede deshacer.",
                    imagen: "tarea-eliminar.webp",
                    alt: "La confirmación para eliminar una tarea",
                },
            ],
            consejos: ["Una captura pegada se nombra con la hora, para distinguirla de las demás."],
        },
    ],
};

export const GUIA = laGuiaDe("proyectos", GUIA_PROYECTOS);

/** Dónde caen las capturas y el vídeo (bajo `public/`). */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración y su portada. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
