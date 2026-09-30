/**
 * La GUÍA PÚBLICA de Mis macros (`/guia/macros`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`):
 * una tarjeta por sección, sus pasos con capturas de la pantalla real y un
 * vídeo de un minuto narrado.
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que
 * pintan `MacrosManager`, `MacrosMenu` y `lib/macros.ts`. Una acción nueva en
 * el editor sin su nombre en la guía pone el banco en rojo, que es como se
 * evita que la guía se quede describiendo una pantalla que ya no existe.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Mis macros en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_MACROS = "Automatizaciones";

/**
 * Las cuatro ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "La lista de macros",
] as const;

/** Las pastillas de la barra de trabajo, en su orden: las tres FILTRAN la lista. */
export const PASTILLAS_DE_LA_BARRA = ["Todas", "Activas", "Inactivas"] as const;

/**
 * Las partes de UNA macro de la lista, de izquierda a derecha, con el nombre
 * que enseña cada botón al posar el cursor (`title`). El color y el nombre no
 * son botones: no tienen nombre.
 */
export const PARTES_DE_UNA_MACRO = [
    { nombre: "Arrastrar", titulo: "Arrastrar para reordenar" },
    { nombre: "Seleccionar", titulo: null },
    { nombre: "Color", titulo: null },
    { nombre: "Nombre", titulo: null },
    { nombre: "Editar", titulo: "Editar" },
    { nombre: "Eliminar", titulo: "Eliminar" },
    { nombre: "Más acciones", titulo: "Más acciones" },
] as const;

/** El menú «⋯» de una macro. «Desactivar» dice «Activar» en una inactiva. */
export const MENU_DE_LA_MACRO = ["Duplicar", "Desactivar"] as const;

/** Los mandos de cada acción dentro del editor, con su `title`. */
export const MANDOS_DE_UNA_ACCION = ["Subir", "Bajar", "Quitar"] as const;

/**
 * Los grupos del selector «qué hace esta acción», en su orden, con cada acción
 * por el nombre que enseña. El banco los compara con `GRUPOS_DE_ACCIONES` y
 * `ETIQUETA_DE_ACCION` de `lib/macros.ts`, que es lo que pinta el selector.
 */
export const ACCIONES_DOCUMENTADAS = [
    {
        grupo: "Responder",
        acciones: ["Enviar mensaje", "Enviar respuesta rápida", "Enviar por otra línea", "Enviar archivo o nota de voz", "Ejecutar flujo"],
    },
    { grupo: "Clasificar", acciones: ["Agregar etiqueta", "Quitar etiqueta", "Cambiar calificación"] },
    { grupo: "Enrutar", acciones: ["Asignar asesor", "Transferir asesor"] },
    { grupo: "Interno", acciones: ["Crear tarea", "Agregar nota interna", "Agente IA"] },
    { grupo: "Control", acciones: ["Esperar (pausa)", "Resolver conversación"] },
] as const;

/** El menú «Macros» de la cabecera de una conversación: la macro elegida y su pie. */
export const PIE_DEL_MENU_DEL_CHAT = "Gestionar macros";

export const GUIA_MACROS: Contenido = {
    titulo: "Mis macros",
    subtitulo: "Varias acciones en una, lanzadas con un clic desde cualquier conversación",
    descripcion:
        "Una macro junta en un botón lo que haces una y otra vez con una conversación: enviar un mensaje, " +
        "ponerle una etiqueta, asignarla a un asesor, crear una tarea o darla por resuelta. La creas una vez " +
        "aquí y la lanzas desde Chats con un clic; las acciones salen en orden, y al final te dice qué se hizo.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo y tu lista de macros.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo · 4 La lista de macros.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Mis macros con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Mis macros está dentro de Automatizaciones. Al entrar a una " +
                        "pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Mis macros dentro de Automatizaciones",
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
                        "1 Buscador · 2 Todas, Activas e Inactivas, que filtran la lista · 3 Nuevo, para crear una macro · " +
                        "4 Acciones masivas.",
                    imagen: "barra-de-trabajo.webp",
                    alt: "La barra de trabajo con sus cuatro partes numeradas",
                },
                {
                    titulo: "Una macro de la lista",
                    texto:
                        "1 Arrastrar · 2 Seleccionar · 3 Color · 4 Nombre, con cuántas acciones tiene y cuántas veces se ha usado · " +
                        "5 Editar · 6 Eliminar · 7 Más acciones.",
                    imagen: "una-macro.webp",
                    alt: "Una macro de la lista con cada parte numerada",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Mis macros por Automatizaciones.",
                "Las macros son de tu cuenta: las ve y las usa todo tu equipo.",
                "Pasa el cursor por cualquier botón para ver su nombre.",
            ],
        },
        {
            slug: "crear-una-macro",
            titulo: "Crear una macro",
            resumen: "Su nombre, su color y las acciones que hace, en orden.",
            icono: "PlusCircle",
            miniatura: "mini-crear-una-macro.webp",
            pasos: [
                {
                    titulo: "Pulsa «Nuevo»",
                    texto: "Es el botón azul de la barra de trabajo. Se abre la ventana «Nueva macro».",
                    imagen: "crear-boton.webp",
                    alt: "El botón Nuevo resaltado en la barra de trabajo",
                },
                {
                    titulo: "Nombre y color",
                    texto:
                        "1 Escribe un nombre que diga qué hace · 2 Elige su color. Con ese nombre y ese color la verás en Chats.",
                    imagen: "crear-nombre.webp",
                    alt: "La ventana Nueva macro con el nombre y el color numerados",
                },
                {
                    titulo: "Agrega sus acciones",
                    texto:
                        "Pulsa «Agregar acción» y elige qué hace en su lista. Suma las que quieras: se hacen en orden, de arriba abajo.",
                    imagen: "crear-acciones.webp",
                    alt: "Una macro con tres acciones numeradas",
                },
                {
                    titulo: "Cambia el orden",
                    texto: "1 Subir · 2 Bajar · 3 Quitar. El número de la izquierda dice en qué orden sale cada una.",
                    imagen: "crear-ordenar.webp",
                    alt: "Los botones Subir, Bajar y Quitar de una acción numerados",
                },
                {
                    titulo: "Guarda",
                    texto:
                        "Si a una acción le falta algo, se marca en rojo y dice qué le falta. Complétala y pulsa «Guardar».",
                    imagen: "crear-falta.webp",
                    alt: "Una acción marcada en rojo con lo que le falta",
                },
            ],
            consejos: [
                "Una macro a medias no se guarda: al lanzarla no haría nada, así que la pantalla te lo avisa antes.",
                "Qué hace cada acción está en las tres secciones que siguen.",
            ],
        },
        {
            slug: "responder",
            titulo: "Acciones que responden",
            resumen: "Enviar un mensaje, una respuesta rápida, un archivo o una nota de voz, o un flujo.",
            icono: "MessageCircle",
            miniatura: "mini-responder.webp",
            pasos: [
                {
                    titulo: "Enviar mensaje",
                    texto: "Escribe el texto: sale por la línea de la conversación en la que lanzas la macro.",
                    imagen: "responder-mensaje.webp",
                    alt: "La acción Enviar mensaje con su texto escrito",
                },
                {
                    titulo: "Enviar respuesta rápida",
                    texto: "Elige una de tus respuestas rápidas y sale tal cual la guardaste.",
                    imagen: "responder-rapida.webp",
                    alt: "La acción Enviar respuesta rápida con una elegida",
                },
                {
                    titulo: "Enviar archivo o nota de voz",
                    texto:
                        "1 Elige un archivo · 2 O graba una nota de voz ahí mismo · 3 El texto que lo acompaña, si quieres.",
                    imagen: "responder-archivo.webp",
                    alt: "La acción Enviar archivo o nota de voz con sus partes numeradas",
                },
                {
                    titulo: "Ejecutar flujo",
                    texto: "Elige uno de tus flujos y arranca en esa conversación, como si lo lanzaras a mano.",
                    imagen: "responder-flujo.webp",
                    alt: "La acción Ejecutar flujo con un flujo elegido",
                },
            ],
            consejos: [
                "Con una nota de voz grabada puedes escucharla antes de usarla, y grabar otra si no te gustó.",
                "Si quieres escribir algo y mandar un archivo, pon las dos acciones una detrás de otra.",
            ],
        },
        {
            slug: "otra-linea",
            titulo: "Enviar por otra línea",
            resumen: "Un mensaje que no sale por la línea del chat, sino por otra de tu cuenta.",
            icono: "Send",
            miniatura: "mini-otra-linea.webp",
            pasos: [
                {
                    titulo: "Elige la línea",
                    texto:
                        "La acción «Enviar por otra línea» te deja elegir por cuál sale el mensaje, en vez de la del chat.",
                    imagen: "otra-linea-elegir.webp",
                    alt: "La acción Enviar por otra línea con una línea elegida",
                },
                {
                    titulo: "Escribe el mensaje",
                    texto: "Le llega al mismo contacto, desde el número de la línea que elegiste.",
                    imagen: "otra-linea-mensaje.webp",
                    alt: "El mensaje que sale por la otra línea",
                },
                {
                    titulo: "Una línea de Meta",
                    texto:
                        "1 Plantilla de Meta, para abrir la conversación · 2 Texto libre, que solo llega si el contacto te escribió en las últimas 24 horas.",
                    imagen: "otra-linea-meta.webp",
                    alt: "Una línea de Meta con sus dos formas de enviar numeradas",
                },
            ],
            consejos: [
                "Las líneas de tus otras cuentas salen con el nombre de la cuenta delante.",
                "Si la línea que elegiste ya no existe o no está conectada, la macro te lo dice al lanzarla.",
            ],
        },
        {
            slug: "clasificar-y-enrutar",
            titulo: "Clasificar y asignar",
            resumen: "Etiquetas, la calificación del lead y a qué asesor va la conversación.",
            icono: "Tags",
            miniatura: "mini-clasificar-y-enrutar.webp",
            pasos: [
                {
                    titulo: "Agregar o quitar una etiqueta",
                    texto: "Elige la etiqueta: «Agregar etiqueta» se la pone a la conversación y «Quitar etiqueta» se la quita.",
                    imagen: "clasificar-etiqueta.webp",
                    alt: "La acción Agregar etiqueta con una etiqueta elegida",
                },
                {
                    titulo: "Cambiar calificación",
                    texto: "Elige una de las cinco calificaciones, las mismas que ves en la lista de Chats: de fría a caliente, finalizado o descartado.",
                    imagen: "clasificar-calificacion.webp",
                    alt: "La acción Cambiar calificación con Caliente elegida",
                },
                {
                    titulo: "Asignar o transferir",
                    texto:
                        "«Asignar asesor» se la da a quien elijas; «Transferir asesor» se la pasa de quien la tiene a otro.",
                    imagen: "clasificar-asesor.webp",
                    alt: "La acción Asignar asesor con un asesor elegido",
                },
            ],
            consejos: ["Así una macro de «Venta cerrada» deja la conversación etiquetada, calificada y con su asesor de una vez."],
        },
        {
            slug: "tareas-y-cierre",
            titulo: "Tareas, notas y cierre",
            resumen: "Crear una tarea, dejar una nota interna, el Agente IA, esperar y resolver.",
            icono: "ListChecks",
            miniatura: "mini-tareas-y-cierre.webp",
            pasos: [
                {
                    titulo: "Crear tarea",
                    texto: "1 El título · 2 Su tipo · 3 En cuántos días vence · 4 Quién la hace.",
                    imagen: "tareas-tarea.webp",
                    alt: "La acción Crear tarea con sus partes numeradas",
                },
                {
                    titulo: "Agregar nota interna",
                    texto: "Una nota en la conversación que solo ve tu equipo; el contacto no la recibe.",
                    imagen: "tareas-nota.webp",
                    alt: "La acción Agregar nota interna con su texto",
                },
                {
                    titulo: "Agente IA",
                    texto: "Actívalo o desactívalo en esa conversación: por ejemplo, para que atienda una persona.",
                    imagen: "tareas-agente.webp",
                    alt: "La acción Agente IA con Desactivar elegido",
                },
                {
                    titulo: "Esperar y resolver",
                    texto:
                        "1 «Esperar» hace una pausa de hasta 20 segundos entre dos acciones · 2 «Resolver conversación» la da por terminada.",
                    imagen: "tareas-esperar.webp",
                    alt: "Las acciones Esperar y Resolver conversación numeradas",
                },
            ],
            consejos: [
                "Resolver suele ir al final: después de despedirse del contacto.",
                "La pausa sirve para que dos mensajes seguidos no lleguen pegados.",
            ],
        },
        {
            slug: "usar-en-un-chat",
            titulo: "Lanzar una macro en un chat",
            resumen: "El botón «Macros» de la conversación, y lo que te dice al terminar.",
            icono: "Zap",
            miniatura: "mini-usar-en-un-chat.webp",
            pasos: [
                {
                    titulo: "El botón «Macros»",
                    texto: "Está en la cabecera de la conversación abierta en Chats, al lado de Acciones.",
                    imagen: "usar-boton.webp",
                    alt: "El botón Macros resaltado en la cabecera de una conversación",
                },
                {
                    titulo: "Elige la macro",
                    texto:
                        "Salen tus macros activas, con su color. Púlsala y sus acciones se hacen en esa conversación, en orden.",
                    imagen: "usar-menu.webp",
                    alt: "El menú Macros abierto con las macros activas",
                },
                {
                    titulo: "Te dice qué se hizo",
                    texto:
                        "Al terminar sale un aviso: cuántas acciones se aplicaron y, si alguna no salió, cuál y por qué.",
                    imagen: "usar-resultado.webp",
                    alt: "El aviso Macro aplicada después de lanzarla",
                },
                {
                    titulo: "Gestionar macros",
                    texto: "Abajo del menú: te trae a esta pantalla para crear o cambiar tus macros.",
                    imagen: "usar-gestionar.webp",
                    alt: "El enlace Gestionar macros resaltado al pie del menú",
                },
            ],
            consejos: [
                "Las macros inactivas no salen en este menú: actívalas aquí para volver a verlas.",
                "Si una acción no pudo hacerse, las demás siguen: el aviso te dice cuál falló para que la hagas a mano.",
            ],
        },
        {
            slug: "buscar-y-ordenar",
            titulo: "Buscar y ordenar",
            resumen: "Las tres pastillas, el buscador y el orden en que salen en Chats.",
            icono: "Filter",
            miniatura: "mini-buscar-y-ordenar.webp",
            pasos: [
                {
                    titulo: "Todas, Activas e Inactivas",
                    texto: "Pulsa una pastilla y la lista enseña solo esas. El número dice cuántas hay de cada una.",
                    imagen: "buscar-pastillas.webp",
                    alt: "Las tres pastillas con la de Inactivas puesta",
                },
                {
                    titulo: "El buscador",
                    texto: "Escribe parte del nombre de la macro, con o sin tildes.",
                    imagen: "buscar-resultado.webp",
                    alt: "El resultado de buscar una macro por su nombre",
                },
                {
                    titulo: "Arrastrar para ordenar",
                    texto: "Agarra la macro por los puntos de su izquierda y suéltala donde quieras. En Chats salen en este orden.",
                    imagen: "buscar-arrastrar.webp",
                    alt: "El asa de arrastrar de una macro resaltada",
                },
            ],
            consejos: ["Con una búsqueda o una pastilla puesta no se arrastra: vuelve a «Todas» y borra el buscador para ordenar."],
        },
        {
            slug: "activar-duplicar-eliminar",
            titulo: "Editar, duplicar, desactivar y eliminar",
            resumen: "Cambia una macro, copia una parecida, apágala sin perderla o bórrala.",
            icono: "ToggleRight",
            miniatura: "mini-activar-duplicar-eliminar.webp",
            pasos: [
                {
                    titulo: "Editar",
                    texto: "El lápiz abre la macro en la misma ventana en la que la creaste.",
                    imagen: "editar-boton.webp",
                    alt: "El botón Editar de una macro resaltado",
                },
                {
                    titulo: "Más acciones",
                    texto: "1 Duplicar hace una copia para cambiarla · 2 Desactivar la quita de Chats sin borrarla.",
                    imagen: "mas-acciones.webp",
                    alt: "El menú Más acciones abierto con sus dos opciones numeradas",
                },
                {
                    titulo: "Una macro inactiva",
                    texto: "Sale tachada y dice «Inactiva». En su menú, «Activar» la devuelve a Chats.",
                    imagen: "macro-inactiva.webp",
                    alt: "Una macro inactiva tachada en la lista",
                },
                {
                    titulo: "Eliminar",
                    texto: "La papelera roja. Siempre pide confirmación y dice qué macro se borra.",
                    imagen: "eliminar-confirmar.webp",
                    alt: "La ventana de confirmación para eliminar una macro",
                },
            ],
            consejos: [
                "Si no la vas a usar un tiempo, desactívala: no se pierde nada.",
                "Eliminar no se puede deshacer.",
            ],
        },
        {
            slug: "acciones-masivas",
            titulo: "Acciones masivas",
            resumen: "Marca varias macros y elimínalas de una vez.",
            icono: "MoreHorizontal",
            miniatura: "mini-acciones-masivas.webp",
            pasos: [
                {
                    titulo: "Marca las macros",
                    texto: "Con la casilla de cada una. Solo cuentan las que se ven con el filtro puesto.",
                    imagen: "masivas-marcar.webp",
                    alt: "Dos macros marcadas en la lista",
                },
                {
                    titulo: "El menú «⋯»",
                    texto: "1 Eliminar todas tus macros · 2 Eliminar solo las que marcaste.",
                    imagen: "masivas-menu.webp",
                    alt: "El menú de acciones masivas abierto con sus opciones numeradas",
                },
                {
                    titulo: "Confirma",
                    texto: "La ventana dice cuántas se borran. «Cancelar» no cambia nada.",
                    imagen: "masivas-confirmar.webp",
                    alt: "La ventana de confirmación de las acciones masivas",
                },
            ],
            consejos: ["«Eliminar todas» borra todas tus macros aunque no estén marcadas: úsala con cuidado."],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("macros", GUIA_MACROS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
