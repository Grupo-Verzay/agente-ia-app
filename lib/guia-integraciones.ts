/**
 * La GUÍA PÚBLICA de Integrar URLs (`/guia/integraciones`): qué dice cada
 * sección y qué captura enseña cada paso. Puro: lo leen la página, el script
 * que toma las capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que las guías de Leads, Catálogo, Diagramas, Reuniones y
 * Mis notas (armada con `laGuiaDe`) y se pinta con las MISMAS piezas
 * (`components/guia/Guia.tsx`): una tarjeta por sección, sus pasos con capturas
 * de la pantalla real y un vídeo de un minuto narrado.
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que pinta
 * `MainIntegraciones.tsx` y con las reglas de `lib/integraciones.ts`. Un botón
 * nuevo en la fila sin su nombre aquí —o un tope que cambie— pone el banco en
 * rojo, que es como se evita que la guía describa una pantalla que ya no
 * existe.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";
import { LARGO_MAXIMO_DEL_NOMBRE, TOPE_DE_INTEGRACIONES } from "@/lib/integraciones";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Integrar URLs en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_INTEGRACIONES = "Apps Externas";

/**
 * Las cinco ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "La lista de apps",
    "El pie",
] as const;

/**
 * Los mandos de UNA FILA de la lista, de izquierda a derecha, con el nombre
 * que enseña cada uno al posar el cursor (`title` en `MainIntegraciones.tsx`).
 * El icono del globo y el texto no son mandos.
 */
export const MANDOS_DE_LA_FILA = [
    { nombre: "Arrastrar", titulo: "Arrastrar para reordenar" },
    { nombre: "Abrir", titulo: "Abrir en nueva pestaña" },
    { nombre: "Editar", titulo: "Editar" },
    { nombre: "Eliminar", titulo: "Eliminar" },
] as const;

/** Los dos campos de la ventana de «Nuevo», con su rótulo. */
export const CAMPOS_DE_LA_VENTANA = ["Nombre", "Dirección"] as const;

export const GUIA_INTEGRACIONES: Contenido = {
    titulo: "Integrar URLs",
    subtitulo: "Tus apps web favoritas, abiertas dentro de cada chat",
    descripcion:
        "Integrar URLs pone tus apps web —un formulario, un bot, un catálogo, una hoja de cálculo— como pestañas dentro " +
        "de cada chat, al lado de Mensajes y Notas. Agregas la dirección una vez y la tienes a mano mientras atiendes, " +
        "sin cambiar de ventana.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo, la lista de apps y el pie.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo · 4 La lista de apps, una por fila · 5 El pie, con cuántas llevas.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Integrar URLs con sus cinco partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Integrar URLs está dentro de Apps Externas. Al entrar a una " +
                        "pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Integrar URLs dentro de Apps Externas",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La barra de trabajo",
                    texto: "1 Buscador, por nombre o por dirección · 2 Nuevo, para agregar una app.",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con el buscador y el botón Nuevo numerados",
                },
                {
                    titulo: "Una fila de la lista",
                    texto:
                        "1 Arrastrar, para cambiar el orden · 2 El nombre y la dirección · 3 Abrir en nueva pestaña · " +
                        "4 Editar · 5 Eliminar.",
                    imagen: "fila.webp",
                    alt: "Una fila de la lista con cada mando numerado",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Integrar URLs por Apps Externas.",
                `Puedes tener hasta ${TOPE_DE_INTEGRACIONES} apps. El pie te dice cuántas llevas.`,
                "Las apps son de tu usuario: las ves tú en tus chats.",
            ],
        },
        {
            slug: "agregar",
            titulo: "Agregar una app",
            resumen: "Ponle un nombre, pega su dirección y ya sale en tus chats.",
            icono: "PlusCircle",
            miniatura: "mini-agregar.webp",
            pasos: [
                {
                    titulo: "Pulsa «Nuevo»",
                    texto: "Es el botón azul de la barra de trabajo. Se abre una ventana con dos campos.",
                    imagen: "agregar-boton.webp",
                    alt: "El botón Nuevo resaltado en la barra de trabajo",
                },
                {
                    titulo: "Nombre y dirección",
                    texto:
                        "El nombre es el rótulo de la pestaña en tus chats. La dirección es la de la app: cópiala entera " +
                        "desde el navegador.",
                    imagen: "agregar-ventana.webp",
                    alt: "La ventana Nueva app con el nombre y la dirección escritos",
                },
                {
                    titulo: "Pulsa «Agregar»",
                    texto: "La app queda al final de la lista y ya sale como pestaña en tus chats.",
                    imagen: "agregar-lista.webp",
                    alt: "La app recién agregada al final de la lista",
                },
            ],
            consejos: [
                "Si la dirección no empieza por https://, se le pone sola.",
                `El nombre admite hasta ${LARGO_MAXIMO_DEL_NOMBRE} caracteres, y no puede repetirse: dos pestañas iguales no se distinguen.`,
                "Solo se aceptan direcciones web: si algo no cuadra, la ventana te dice qué corregir debajo del campo.",
            ],
        },
        {
            slug: "en-los-chats",
            titulo: "Tu app dentro de los chats",
            resumen: "Cada app es una pestaña más de la conversación, al lado de Mensajes y Notas.",
            icono: "MessageCircle",
            miniatura: "mini-en-los-chats.webp",
            pasos: [
                {
                    titulo: "La pestaña de tu app",
                    texto: "Abre cualquier chat: en la fila de pestañas, detrás de Mensajes y Notas, sale una por cada app.",
                    imagen: "chats-pestanas.webp",
                    alt: "La fila de pestañas del chat con las apps detrás de Mensajes y Notas",
                },
                {
                    titulo: "La app, sin salir del chat",
                    texto: "Púlsala y la app se abre ahí mismo, en el sitio de la conversación.",
                    imagen: "chats-app.webp",
                    alt: "Una app abierta dentro de la pestaña del chat",
                },
                {
                    titulo: "Vuelve a la conversación",
                    texto: "Pulsa «Mensajes» y vuelves a la conversación, donde la dejaste.",
                    imagen: "chats-mensajes.webp",
                    alt: "La pestaña Mensajes resaltada con la conversación abierta",
                },
            ],
            consejos: [
                "Si tienes muchas apps y no caben, las últimas se guardan en «Más», al final de la fila de pestañas.",
                "Las pestañas salen en el mismo orden que la lista de Integrar URLs.",
            ],
        },
        {
            slug: "abrir-y-editar",
            titulo: "Abrir y editar",
            resumen: "Ábrela en su propia pestaña del navegador, o cámbiale el nombre o la dirección.",
            icono: "PenLine",
            miniatura: "mini-abrir-y-editar.webp",
            pasos: [
                {
                    titulo: "Abrir en nueva pestaña",
                    texto: "El botón de la flecha abre la app fuera de la plataforma, en una pestaña nueva del navegador.",
                    imagen: "abrir-boton.webp",
                    alt: "El botón Abrir en nueva pestaña resaltado en una fila",
                },
                {
                    titulo: "Pulsa el lápiz",
                    texto: "Se abre la misma ventana que al agregarla, con el nombre y la dirección de ahora.",
                    imagen: "editar-ventana.webp",
                    alt: "La ventana Editar app con los datos de la app",
                },
                {
                    titulo: "Pulsa «Guardar»",
                    texto: "El cambio se ve al momento en la lista y en la pestaña de tus chats.",
                    imagen: "editar-guardado.webp",
                    alt: "La fila con el nombre ya cambiado",
                },
            ],
            consejos: ["«Cancelar», la X o pulsar fuera de la ventana la cierran sin cambiar nada."],
        },
        {
            slug: "ordenar-y-buscar",
            titulo: "Ordenar y buscar",
            resumen: "Arrastra para decidir el orden de las pestañas y encuentra una app al escribir.",
            icono: "Search",
            miniatura: "mini-ordenar-y-buscar.webp",
            pasos: [
                {
                    titulo: "Arrastra para ordenar",
                    texto: "Toma una fila por los seis puntos de la izquierda y suéltala donde la quieras. El orden se guarda solo.",
                    imagen: "ordenar-asa.webp",
                    alt: "El asa de arrastre resaltada en una fila",
                },
                {
                    titulo: "Busca por nombre o dirección",
                    texto: "Escribe en el buscador y la lista se queda solo con las apps que coinciden.",
                    imagen: "buscar.webp",
                    alt: "El buscador con un texto y la lista filtrada",
                },
                {
                    titulo: "Buscando no se ordena",
                    texto: "Con la búsqueda puesta, el asa se apaga. Borra la búsqueda para volver a ordenar.",
                    imagen: "buscar-sin-ordenar.webp",
                    alt: "El pie avisa que hay que borrar la búsqueda para reordenar",
                },
            ],
            consejos: ["El orden de la lista es el orden de las pestañas en tus chats."],
        },
        {
            slug: "eliminar",
            titulo: "Eliminar una app",
            resumen: "Quítala de la plataforma. La app en sí no se toca.",
            icono: "Trash2",
            miniatura: "mini-eliminar.webp",
            pasos: [
                {
                    titulo: "Pulsa la papelera",
                    texto: "Es el último botón de la fila, en rojo.",
                    imagen: "eliminar-boton.webp",
                    alt: "El botón Eliminar resaltado en una fila",
                },
                {
                    titulo: "Confirma",
                    texto: "La plataforma te pregunta antes de quitarla. «Cancelar» la deja como estaba.",
                    imagen: "eliminar-confirmar.webp",
                    alt: "La ventana que pide confirmar antes de eliminar la app",
                },
                {
                    titulo: "Sale de la lista y de tus chats",
                    texto: "Deja de salir como pestaña en tus chats. La app en sí sigue funcionando en su sitio.",
                    imagen: "eliminar-listo.webp",
                    alt: "La lista ya sin la app eliminada",
                },
            ],
            consejos: ["Si llegaste al máximo de apps, elimina una que ya no uses para poder agregar otra."],
        },
        {
            slug: "cuando-no-abre",
            titulo: "Cuando una app no se abre",
            resumen: "Qué hacer si la dirección tiene un error o la app no deja abrirse dentro.",
            icono: "TriangleAlert",
            miniatura: "mini-cuando-no-abre.webp",
            pasos: [
                {
                    titulo: "La ventana te dice qué corregir",
                    texto: "Si la dirección no es válida, la ventana lo dice debajo del campo y no la guarda hasta que la corrijas.",
                    imagen: "no-abre-ventana.webp",
                    alt: "La ventana con el aviso de dirección no válida debajo del campo",
                },
                {
                    titulo: "Una dirección para revisar",
                    texto: "Si una app guardada tiene una dirección que no se puede abrir, su fila lo avisa en amarillo. Edítala.",
                    imagen: "no-abre-fila.webp",
                    alt: "Una fila con el aviso de que su dirección no se puede abrir",
                },
                {
                    titulo: "Si sale en blanco, ábrela aparte",
                    texto:
                        "Algunas webs no dejan abrirse dentro de otra. Si tu app sale en blanco en el chat, usa «Abrir en " +
                        "nueva pestaña».",
                    imagen: "no-abre-aparte.webp",
                    alt: "El botón Abrir en nueva pestaña resaltado para una app que no se deja incrustar",
                },
            ],
            consejos: [
                "Copia la dirección entera desde la barra del navegador: con https:// y sin espacios.",
                "Si la app pide iniciar sesión, hazlo una vez dentro de la pestaña: el navegador la recuerda.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("integraciones", GUIA_INTEGRACIONES);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
