/**
 * La GUÍA PÚBLICA de Google Sheets (`/guia/google-sheets`): qué dice cada
 * sección y qué captura enseña cada paso. Puro: lo leen la página, el script
 * que toma las capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`):
 * una tarjeta por sección, sus pasos con capturas de la pantalla real y un
 * vídeo de un minuto narrado.
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que
 * pintan la pantalla (`GoogleSheetsClient.tsx`), la regla del enlace
 * (`lib/url-de-google-sheets.ts`) y lo que se escribe en la hoja
 * (`booking-form-actions.ts`). Un botón o un aviso nuevo sin su sitio aquí pone
 * el banco en rojo, que es como se evita que la guía se quede describiendo una
 * pantalla que ya no existe.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Google Sheets en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_GOOGLE_SHEETS = "Integraciones";

/**
 * Las cuatro ZONAS de la pantalla con una hoja vinculada, en el orden en que se
 * leen, tal como las numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de la hoja",
    "Tu hoja de cálculo",
] as const;

/**
 * Los mandos de la BARRA DE LA HOJA, en su orden de izquierda a derecha, con
 * la marca que lleva cada uno en la pantalla (`data-boton`).
 */
export const PARTES_DE_LA_BARRA_DE_LA_HOJA = [
    { nombre: "Abrir", boton: "abrir" },
    { nombre: "Copiar link", boton: "copiar-enlace" },
    { nombre: "Cambiar hoja", boton: "cambiar" },
] as const;

/** Los dos pasos de la tarjeta de vincular, tal como se leen en ella. */
export const PASOS_DE_VINCULAR = [
    "1. Comparte tu hoja con este correo como Editor",
    "2. Pega el enlace de tu hoja",
] as const;

/**
 * Los enlaces que NO sirven y lo que la pantalla dice de cada uno. El banco
 * pasa cada ejemplo por `laHojaQueSeGuarda` y exige ese motivo, palabra por
 * palabra: la guía enseña el aviso que de verdad sale.
 */
export const ENLACES_QUE_NO_SIRVEN = [
    {
        caso: "Un enlace que no es de una hoja",
        ejemplo: "https://docs.google.com/document/d/1Hq4tR8kLmN2pX9vB7cD3eF5gH6jK0lZ/edit",
        motivo: "Ese enlace no es de una hoja de Google Sheets. Abre tu hoja y copia el enlace de la barra de direcciones.",
    },
    {
        caso: "El enlace de «Publicar en la web»",
        ejemplo: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQk8sR3mT7vW2xY5zA9bC4dE6fG1hJ/pubhtml",
        motivo: "Ese es el enlace de «Publicar en la web». Copia el enlace de la barra de direcciones de tu hoja.",
    },
] as const;

/**
 * Lo que la plataforma escribe en tu hoja: las respuestas del formulario de
 * una cita van a esta pestaña, con estas columnas delante y después una por
 * pregunta (`syncResponseToSheets`, `booking-form-actions.ts`).
 */
export const PESTANA_DE_LAS_CITAS = "Registro cita";
export const COLUMNAS_DE_LAS_CITAS = ["Formulario", "Fecha", "WhatsApp", "Nombre"] as const;

export const GUIA_GOOGLE_SHEETS: Contenido = {
    titulo: "Google Sheets",
    subtitulo: "Tu hoja de cálculo, dentro de la plataforma y al día con tus citas",
    descripcion:
        "Google Sheets pone tu hoja de cálculo dentro de la plataforma: la vinculas una vez, la ves y la editas sin " +
        "salir, la abres o copias su enlace con un clic y la cambias por otra cuando quieras. Y cada vez que un " +
        "cliente llena el formulario de una cita, su respuesta llega sola a tu hoja.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de la hoja y tu hoja de cálculo.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de la hoja · 4 Tu hoja de cálculo.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Google Sheets con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Google Sheets está dentro de Integraciones. Al entrar a una " +
                        "pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Google Sheets dentro de Integraciones",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La barra de la hoja",
                    texto: "1 Abrir la hoja en Google Sheets · 2 Copiar su enlace · 3 Cambiar de hoja. A la izquierda, el enlace de la hoja vinculada.",
                    imagen: "barra-de-la-hoja.webp",
                    alt: "La barra de la hoja con sus tres botones numerados",
                },
            ],
        },
        {
            slug: "vincular",
            titulo: "Vincular tu hoja",
            resumen: "Comparte tu hoja con el correo de la plataforma y pega su enlace.",
            icono: "Link2",
            miniatura: "mini-vincular.webp",
            pasos: [
                {
                    titulo: "Sin hoja todavía",
                    texto: "La primera vez sale la tarjeta de vincular, con sus dos pasos. Debajo, el aviso de que aún no hay una hoja.",
                    imagen: "vincular-vacia.webp",
                    alt: "La pantalla sin hoja, con la tarjeta de vincular arriba",
                },
                {
                    titulo: "1. Comparte tu hoja con este correo",
                    texto:
                        "Copia el correo con su botón. En tu hoja pulsa «Compartir», pégalo y dale permiso de Editor: así " +
                        "la plataforma puede escribir en ella.",
                    imagen: "vincular-correo.webp",
                    alt: "El correo con el que compartir la hoja y su botón de copiar",
                },
                {
                    titulo: "2. Pega el enlace de tu hoja",
                    texto: "Cópialo de la barra de direcciones de tu hoja, con la pestaña que quieres ver abierta, y pégalo en el campo.",
                    imagen: "vincular-enlace.webp",
                    alt: "El enlace de la hoja pegado en el campo",
                },
                {
                    titulo: "Guardar",
                    texto: "El botón verde. «Cancelar» deja el campo como estaba.",
                    imagen: "vincular-guardar.webp",
                    alt: "El botón Guardar resaltado",
                },
                {
                    titulo: "Listo: tu hoja aparece",
                    texto: "La tarjeta se cierra y tu hoja se abre dentro de la pantalla, con su barra encima.",
                    imagen: "vincular-lista.webp",
                    alt: "La hoja vinculada dentro de la pantalla",
                },
            ],
            consejos: [
                "Si no la compartes con el correo, la verás igual, pero la plataforma no podrá escribir en ella.",
                "Se guarda el enlace limpio de tu hoja, con la pestaña que tenías abierta.",
            ],
        },
        {
            slug: "tu-hoja",
            titulo: "Tu hoja dentro de la plataforma",
            resumen: "Mira y edita tu hoja sin salir, o ábrela en Google Sheets.",
            icono: "Sheet",
            miniatura: "mini-tu-hoja.webp",
            pasos: [
                {
                    titulo: "La hoja entera, aquí",
                    texto: "Ocupa todo el alto de la pantalla. Lo que escribes en ella se guarda en tu hoja de Google, como siempre.",
                    imagen: "hoja-dentro.webp",
                    alt: "La hoja de cálculo ocupando la pantalla",
                },
                {
                    titulo: "Sus pestañas",
                    texto: "Abajo están las pestañas de tu hoja: pulsa una para verla. Abre la que tenías al copiar el enlace.",
                    imagen: "hoja-pestanas.webp",
                    alt: "Las pestañas de la hoja resaltadas abajo",
                },
                {
                    titulo: "Abrir en Google Sheets",
                    texto: "«Abrir» la lleva a una pestaña nueva del navegador, con todas las herramientas de Google.",
                    imagen: "hoja-abrir.webp",
                    alt: "El botón Abrir de la barra de la hoja resaltado",
                },
            ],
            consejos: ["Para ver la hoja tienes que haber entrado en tu cuenta de Google en este navegador."],
        },
        {
            slug: "copiar-enlace",
            titulo: "Copiar el enlace",
            resumen: "Llévate el enlace de tu hoja para mandarlo a quien lo necesite.",
            icono: "Share2",
            miniatura: "mini-copiar-enlace.webp",
            pasos: [
                {
                    titulo: "Pulsa «Copiar link»",
                    texto: "Es el segundo botón de la barra de la hoja.",
                    imagen: "copiar-boton.webp",
                    alt: "El botón Copiar link resaltado",
                },
                {
                    titulo: "Enlace copiado",
                    texto: "Sale el aviso «Enlace copiado» y el botón se marca un momento. Ya lo puedes pegar donde quieras.",
                    imagen: "copiar-hecho.webp",
                    alt: "El aviso Enlace copiado y el botón marcado",
                },
                {
                    titulo: "Si no se copia",
                    texto: "Algunos navegadores no dejan copiar solos: la pantalla te lo dice. Selecciona el enlace de la barra y usa Ctrl+C.",
                    imagen: "copiar-enlace-visible.webp",
                    alt: "El enlace de la hoja resaltado en la barra",
                },
            ],
        },
        {
            slug: "cambiar-de-hoja",
            titulo: "Cambiar de hoja",
            resumen: "Pon otra hoja en su lugar, o vuelve atrás sin tocar nada.",
            icono: "ArrowLeftRight",
            miniatura: "mini-cambiar-de-hoja.webp",
            pasos: [
                {
                    titulo: "Pulsa «Cambiar hoja»",
                    texto: "Es el tercer botón de la barra de la hoja.",
                    imagen: "cambiar-boton.webp",
                    alt: "El botón Cambiar hoja resaltado",
                },
                {
                    titulo: "Vuelve la tarjeta, con tu enlace puesto",
                    texto: "El campo trae el enlace de la hoja actual, y la hoja sigue a la vista debajo mientras decides.",
                    imagen: "cambiar-tarjeta.webp",
                    alt: "La tarjeta de vincular abierta con el enlace actual y la hoja debajo",
                },
                {
                    titulo: "Pega el nuevo y guarda",
                    texto: "Cambia el enlace y pulsa «Guardar»: la hoja nueva sustituye a la anterior.",
                    imagen: "cambiar-guardar.webp",
                    alt: "Un enlace nuevo en el campo y el botón Guardar resaltado",
                },
                {
                    titulo: "O cancela",
                    texto: "«Cancelar» cierra la tarjeta y deja la hoja que ya tenías, sin cambiar nada.",
                    imagen: "cambiar-cancelar.webp",
                    alt: "El botón Cancelar resaltado",
                },
            ],
            consejos: ["Recuerda compartir también la hoja nueva con el correo de la plataforma."],
        },
        {
            slug: "quitar-la-hoja",
            titulo: "Quitar la hoja",
            resumen: "Desvincúlala cuando ya no la uses: tu hoja no se borra.",
            icono: "Unlink",
            miniatura: "mini-quitar-la-hoja.webp",
            pasos: [
                {
                    titulo: "«Quitar hoja», en la tarjeta",
                    texto: "Pulsa «Cambiar hoja» y en la tarjeta que se abre sale «Quitar hoja», en rojo, entre Cancelar y Guardar.",
                    imagen: "quitar-boton.webp",
                    alt: "El botón Quitar hoja resaltado en la tarjeta de vincular",
                },
                {
                    titulo: "Confírmalo",
                    texto:
                        "Te pregunta antes: la plataforma deja de mostrarla y de escribir en ella las respuestas de tus " +
                        "citas. Tu hoja no se borra: sigue en tu Google Drive.",
                    imagen: "quitar-confirmar.webp",
                    alt: "La confirmación de quitar la hoja",
                },
                {
                    titulo: "Sin hoja otra vez",
                    texto: "Vuelve la pantalla del principio, lista para vincular otra cuando quieras.",
                    imagen: "quitar-listo.webp",
                    alt: "La pantalla sin hoja, con la tarjeta de vincular",
                },
            ],
        },
        {
            slug: "enlace-que-no-sirve",
            titulo: "Si el enlace no sirve",
            resumen: "La pantalla te dice por qué no se guardó y qué enlace copiar.",
            icono: "TriangleAlert",
            miniatura: "mini-enlace-que-no-sirve.webp",
            pasos: [
                {
                    titulo: "Un enlace que no es de una hoja",
                    texto: "Un documento, una presentación o una carpeta de Drive no se guardan. El aviso sale en rojo debajo del campo.",
                    imagen: "no-sirve-documento.webp",
                    alt: "El aviso de que el enlace no es de una hoja",
                },
                {
                    titulo: "El de «Publicar en la web»",
                    texto: "Ese enlace es de solo lectura y no sirve aquí. El aviso te pide el de la barra de direcciones.",
                    imagen: "no-sirve-publicado.webp",
                    alt: "El aviso del enlace de Publicar en la web",
                },
                {
                    titulo: "Corrígelo y vuelve a guardar",
                    texto: "Al escribir en el campo el aviso se va. Pega el enlace de tu hoja y pulsa «Guardar».",
                    imagen: "no-sirve-corregido.webp",
                    alt: "El enlace corregido en el campo, sin aviso",
                },
            ],
        },
        {
            slug: "respuestas-de-citas",
            titulo: "Las respuestas de tus citas",
            resumen: "Cada formulario de cita que llena un cliente llega solo a tu hoja.",
            icono: "ClipboardList",
            miniatura: "mini-respuestas-de-citas.webp",
            pasos: [
                {
                    titulo: "La pestaña «Registro cita»",
                    texto: "La plataforma la crea sola en tu hoja la primera vez que llega una respuesta.",
                    imagen: "citas-pestana.webp",
                    alt: "La pestaña Registro cita resaltada en la hoja",
                },
                {
                    titulo: "Una fila por respuesta",
                    texto: "1 Formulario, Fecha, WhatsApp y Nombre · 2 una columna por cada pregunta de tu formulario. Cada respuesta, una fila.",
                    imagen: "citas-filas.webp",
                    alt: "Las columnas de Registro cita numeradas, con sus filas a la vista",
                },
                {
                    titulo: "Compartida como Editor",
                    texto: "Para escribir en ella, la hoja tiene que estar compartida con el correo del paso 1, como Editor.",
                    imagen: "citas-compartir.webp",
                    alt: "El paso de compartir con el correo de la plataforma resaltado",
                },
            ],
            consejos: ["Las respuestas se escriben en la hoja que tengas vinculada en ese momento."],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("google-sheets", GUIA_GOOGLE_SHEETS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
