/**
 * La GUÍA PÚBLICA de Etiquetas (`/guia/etiquetas`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que pintan
 * los componentes de `/tags` (`TagsPageClient`, `TagKanbanBoard`,
 * `SortableTagList`, `CrmGlobalActionsMenu` y `lib/etiquetas-de-la-pantalla.ts`).
 * Un rango, una vista o un mando nuevo en la pantalla sin su nombre aquí pone el
 * banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Etiquetas en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_ETIQUETAS = "Contactos";

/** Las cuatro ZONAS de la pantalla, tal como las numera «Todo en una pantalla». */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "El tablero",
] as const;

/** Las dos vistas de la pantalla. El banco las compara con `TagsPageClient.tsx`. */
export const VISTAS_DOCUMENTADAS = ["Kanban", "Gestionar"] as const;

/** Los cinco rangos del filtro por puntaje. El banco los compara con `RANGOS_DE_PUNTAJE`. */
export const RANGOS_DOCUMENTADOS = [
    { nombre: "Bajo", tramo: "0–25" },
    { nombre: "Medio", tramo: "26–50" },
    { nombre: "Moderado", tramo: "51–75" },
    { nombre: "Alto", tramo: "76–90" },
    { nombre: "Listo", tramo: "91–100" },
] as const;

/** Las partes de la barra de trabajo, con su `data-zona` (`TagsPageClient.tsx`). */
export const PARTES_DE_LA_BARRA_DE_TRABAJO = [
    { nombre: "Kanban y Gestionar", zona: "vista" },
    { nombre: "Las etiquetas más usadas", zona: "mas-usadas" },
    { nombre: "El filtro por puntaje", zona: "filtro-de-puntaje" },
    { nombre: "Acciones masivas", zona: "acciones" },
] as const;

/** Las partes de la barra del tablero, con su `data-zona` (`TagKanbanBoard.tsx`). */
export const PARTES_DE_LA_BARRA_DEL_TABLERO = [
    { nombre: "Buscar contacto", zona: "buscador" },
    { nombre: "Cuántos contactos", zona: "contador" },
    { nombre: "Actualizar", zona: "actualizar" },
    { nombre: "Calificar con IA", zona: "puntuar-todos" },
] as const;

/** Los mandos de la cabecera de una columna, con su `data-zona`. */
export const PARTES_DE_UNA_COLUMNA = [
    { nombre: "Cuántos contactos tiene", zona: "cuantos" },
    { nombre: "Seleccionar la columna", zona: "seleccionar-columna" },
    { nombre: "Automatizaciones", zona: "automatizaciones" },
] as const;

/** La columna que va siempre primero, con los contactos sin ninguna etiqueta. */
export const COLUMNA_SIN_ETIQUETA = "Sin etiqueta";

/** El menú «⋯» de la barra. El banco los compara con `CrmGlobalActionsMenu.tsx` (sin el número). */
export const ACCIONES_MASIVAS_DOCUMENTADAS = [
    "Cancelar follow-ups activos",
    "Eliminar follow-ups activos",
    "Eliminar follow-ups enviados",
    "Reactivar follow-ups enviados",
] as const;

export const GUIA_ETIQUETAS: Contenido = {
    titulo: "Etiquetas",
    subtitulo: "Tus contactos ordenados por etapa, en un tablero",
    descripcion:
        "Etiquetas reparte tus contactos en un tablero con una columna por etiqueta: los mueves arrastrando, la IA " +
        "les pone un puntaje del 0 al 100 según lo que han hablado contigo, y filtras para ver solo a los que están " +
        "listos para comprar. Desde aquí también creas, ordenas y borras tus etiquetas.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo y el tablero con tus contactos.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo de Etiquetas · 4 El tablero.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Etiquetas con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Etiquetas está dentro de Contactos. Al entrar a una " +
                        "pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Etiquetas dentro de Contactos",
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
                        "1 Kanban y Gestionar, las dos vistas · 2 Las etiquetas con más contactos · 3 El filtro por " +
                        "puntaje · 4 Acciones masivas.",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con cada parte numerada",
                },
                {
                    titulo: "La barra del tablero",
                    texto: "1 Buscar contacto, por nombre o número · 2 Cuántos contactos hay · 3 Actualizar · 4 Calificar con IA.",
                    imagen: "barra-del-tablero.webp",
                    alt: "La barra del tablero con el buscador, el contador y sus botones numerados",
                },
                {
                    titulo: "Las acciones masivas",
                    texto:
                        "El botón «⋯» del final actúa sobre los seguimientos de todos tus contactos: cancelarlos, " +
                        "borrarlos o volver a activar los que ya se enviaron. Cada uno pide confirmación.",
                    imagen: "acciones-masivas.webp",
                    alt: "El menú de acciones masivas abierto con sus cuatro opciones",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Etiquetas por Contactos.",
                "Las etiquetas son las mismas que pones en Chats y en Leads: lo que cambies aquí se ve en todas partes.",
            ],
        },
        {
            slug: "el-tablero",
            titulo: "El tablero",
            resumen: "Una columna por etiqueta y una tarjeta por contacto, con su puntaje y su estado.",
            icono: "Columns3",
            miniatura: "mini-el-tablero.webp",
            pasos: [
                {
                    titulo: "Una columna por etiqueta",
                    texto:
                        "Cada etiqueta es una columna, en el orden que tú decidas. La primera, «Sin etiqueta», junta a " +
                        "los contactos que todavía no tienen ninguna.",
                    imagen: "columnas.webp",
                    alt: "El tablero con las columnas de cada etiqueta",
                },
                {
                    titulo: "La cabecera de una columna",
                    texto: "1 Cuántos contactos tiene · 2 Seleccionarlos todos · 3 Sus automatizaciones.",
                    imagen: "cabecera-de-columna.webp",
                    alt: "La cabecera de una columna con sus mandos numerados",
                },
                {
                    titulo: "Una tarjeta",
                    texto:
                        "1 La casilla para seleccionar · 2 El nombre y su número, que abre el chat · 3 El puntaje de la " +
                        "IA · 4 Calificar con IA · 5 Por qué tiene ese puntaje · 6 El estado del lead.",
                    imagen: "tarjeta.webp",
                    alt: "Una tarjeta del tablero con cada parte numerada",
                },
                {
                    titulo: "Las automatizaciones de una etiqueta",
                    texto:
                        "El engranaje de la columna abre lo que pasa solo cuando un contacto entra en esa etiqueta, " +
                        "como enviarle un mensaje o lanzar un flujo.",
                    imagen: "automatizaciones.webp",
                    alt: "El panel de automatizaciones de una etiqueta abierto",
                },
            ],
            consejos: [
                "Un contacto con dos etiquetas sale en las dos columnas; debajo de su tarjeta se ven las otras.",
                "Pulsar el número de una tarjeta abre su conversación en Chats.",
            ],
        },
        {
            slug: "arrastrar",
            titulo: "Mover un contacto de etiqueta",
            resumen: "Arrastra la tarjeta a otra columna y la etiqueta cambia sola.",
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
                    texto:
                        "Al soltarla, el contacto deja la etiqueta de donde salió y toma la de la columna nueva. Se " +
                        "guarda al instante.",
                    imagen: "arrastrar-soltar.webp",
                    alt: "La tarjeta ya en la columna de su nueva etiqueta",
                },
                {
                    titulo: "Quitar una etiqueta",
                    texto:
                        "Si la sueltas en «Sin etiqueta», solo pierde la etiqueta de la columna de donde salió; las " +
                        "demás que tuviera se quedan.",
                    imagen: "arrastrar-sin-etiqueta.webp",
                    alt: "Una tarjeta soltada en la columna Sin etiqueta",
                },
            ],
            consejos: [
                "Si una etiqueta tiene automatizaciones, mover un contacto a esa columna las dispara.",
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
                    texto: "Al pulsarlo, el tablero deja solo a los contactos de ese rango, en sus columnas.",
                    imagen: "filtro-puesto.webp",
                    alt: "El tablero filtrado por el rango Listo",
                },
                {
                    titulo: "Quita el filtro",
                    texto: "Pulsa otra vez el mismo rango y vuelve el tablero entero.",
                    imagen: "filtro-quitar.webp",
                    alt: "El rango puesto resaltado, listo para quitarlo con otro clic",
                },
            ],
            consejos: [
                "Los contactos sin calificar no salen en ningún rango: califícalos primero con la IA.",
                "El filtro se suma al buscador: puedes buscar un nombre dentro de los Listos.",
            ],
        },
        {
            slug: "seleccion-multiple",
            titulo: "Varios contactos a la vez",
            resumen: "Marca contactos y ponles una etiqueta o bórralos en un solo paso.",
            icono: "ListChecks",
            miniatura: "mini-seleccion-multiple.webp",
            pasos: [
                {
                    titulo: "Marca los contactos",
                    texto:
                        "La casilla de cada tarjeta lo marca. Para marcar una columna entera, usa su casilla de la " +
                        "cabecera.",
                    imagen: "seleccion-casillas.webp",
                    alt: "Varias tarjetas marcadas en el tablero",
                },
                {
                    titulo: "La barra de la selección",
                    texto:
                        "1 Quitar la selección · 2 Cuántos llevas · 3 Seleccionar todos los que se ven · 4 Agregar " +
                        "etiqueta · 5 Eliminar.",
                    imagen: "seleccion-barra.webp",
                    alt: "La barra de la selección con cada mando numerado",
                },
                {
                    titulo: "Agrega una etiqueta",
                    texto: "La etiqueta de la barra abre tus etiquetas: elige una y se la pones a todos los marcados.",
                    imagen: "seleccion-etiquetar.webp",
                    alt: "El menú para agregar una etiqueta a los contactos marcados",
                },
                {
                    titulo: "Elimínalos",
                    texto:
                        "La papelera borra los contactos marcados con su conversación, sus notas y sus seguimientos. " +
                        "Pide confirmación y no se puede deshacer.",
                    imagen: "seleccion-eliminar.webp",
                    alt: "La ventana que confirma eliminar los contactos marcados",
                },
            ],
            consejos: [
                "Seleccionar todos marca solo lo que se ve: con un filtro o una búsqueda puestos, lo escondido no se toca.",
                "Eliminar contactos solo lo pueden hacer el dueño y los administradores.",
            ],
        },
        {
            slug: "crear-etiqueta",
            titulo: "Crear una etiqueta",
            resumen: "Ponle nombre y color, y aparece su columna en el tablero.",
            icono: "PlusCircle",
            miniatura: "mini-crear-etiqueta.webp",
            pasos: [
                {
                    titulo: "Abre Gestionar",
                    texto: "La vista Gestionar lista tus etiquetas con su color. Ahí se crean, se editan y se ordenan.",
                    imagen: "gestionar.webp",
                    alt: "La vista Gestionar con la lista de etiquetas",
                },
                {
                    titulo: "Pulsa «Nuevo»",
                    texto: "1 El botón azul abre la fila para crearla · 2 Escribe el nombre: sale en mayúsculas.",
                    imagen: "crear-formulario.webp",
                    alt: "La fila para crear una etiqueta con su nombre escrito",
                },
                {
                    titulo: "Elige su color",
                    texto: "1 Seis colores rápidos · 2 O cualquier otro con el selector. Después, Guardar.",
                    imagen: "crear-colores.webp",
                    alt: "Los colores para la etiqueta nueva numerados",
                },
                {
                    titulo: "Ya está en el tablero",
                    texto: "La etiqueta queda al final de la lista y su columna aparece en el tablero, lista para usar.",
                    imagen: "crear-resultado.webp",
                    alt: "La etiqueta nueva al final de la lista",
                },
            ],
            consejos: [
                "Si la creas una persona del equipo con rol de agente, la etiqueta es suya: solo la ven ella, el dueño y los administradores.",
                "No pueden existir dos etiquetas con el mismo nombre.",
            ],
        },
        {
            slug: "editar-etiqueta",
            titulo: "Editar una etiqueta",
            resumen: "Cambia su nombre o su color sin perder los contactos que ya la tienen.",
            icono: "PenLine",
            miniatura: "mini-editar-etiqueta.webp",
            pasos: [
                {
                    titulo: "Pulsa «Editar»",
                    texto: "Cada etiqueta de la lista tiene su botón Editar.",
                    imagen: "editar-boton.webp",
                    alt: "El botón Editar de una etiqueta resaltado",
                },
                {
                    titulo: "Cambia lo que quieras",
                    texto: "La fila se abre con su nombre y su color. Cámbialos y pulsa Guardar.",
                    imagen: "editar-formulario.webp",
                    alt: "La fila de editar una etiqueta abierta",
                },
                {
                    titulo: "Se cambia en todas partes",
                    texto:
                        "Los contactos que la tenían la conservan con el nombre y el color nuevos, en el tablero, en " +
                        "Chats y en Leads.",
                    imagen: "editar-resultado.webp",
                    alt: "La etiqueta con su nombre nuevo en la lista",
                },
            ],
            consejos: ["Cancelar deja la etiqueta como estaba."],
        },
        {
            slug: "ordenar-etiquetas",
            titulo: "Ordenar las etiquetas",
            resumen: "Arrastra las etiquetas y las columnas del tablero siguen ese orden.",
            icono: "ArrowUpDown",
            miniatura: "mini-ordenar-etiquetas.webp",
            pasos: [
                {
                    titulo: "Agarra el asa",
                    texto: "Los seis puntos de la izquierda de cada etiqueta sirven para arrastrarla.",
                    imagen: "ordenar-asa.webp",
                    alt: "El asa para ordenar una etiqueta resaltada",
                },
                {
                    titulo: "Suéltala en su sitio",
                    texto: "Llévala arriba o abajo y suéltala. El orden se guarda solo.",
                    imagen: "ordenar-resultado.webp",
                    alt: "La lista de etiquetas con el orden cambiado",
                },
                {
                    titulo: "El tablero lo sigue",
                    texto: "Las columnas del tablero salen en el mismo orden, siempre detrás de «Sin etiqueta».",
                    imagen: "ordenar-tablero.webp",
                    alt: "Las columnas del tablero en el orden nuevo",
                },
                {
                    titulo: "Sin búsqueda",
                    texto:
                        "Con una búsqueda puesta no se puede ordenar: verías solo unas y no sabrías dónde quedan las " +
                        "demás. Borra la búsqueda primero.",
                    imagen: "ordenar-con-busqueda.webp",
                    alt: "El aviso que pide quitar la búsqueda para ordenar",
                },
            ],
        },
        {
            slug: "eliminar-etiqueta",
            titulo: "Eliminar una etiqueta",
            resumen: "Bórrala de la lista y se quita de todos los contactos que la tenían.",
            icono: "Trash2",
            miniatura: "mini-eliminar-etiqueta.webp",
            pasos: [
                {
                    titulo: "Pulsa la papelera",
                    texto: "La papelera roja de cada etiqueta la borra.",
                    imagen: "eliminar-boton.webp",
                    alt: "La papelera de una etiqueta resaltada",
                },
                {
                    titulo: "Confirma",
                    texto: "Una ventana te pregunta si estás seguro. Eliminar la borra; Cancelar la deja.",
                    imagen: "eliminar-confirmar.webp",
                    alt: "La ventana que confirma eliminar la etiqueta",
                },
                {
                    titulo: "Se va del tablero",
                    texto:
                        "Desaparece su columna y los contactos pierden esa etiqueta, pero no se borran: siguen en sus " +
                        "otras columnas o en «Sin etiqueta».",
                    imagen: "eliminar-resultado.webp",
                    alt: "La lista de etiquetas sin la que se eliminó",
                },
            ],
            consejos: ["Eliminar una etiqueta no se puede deshacer, pero tus contactos no se tocan."],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("etiquetas", GUIA_ETIQUETAS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
