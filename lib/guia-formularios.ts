/**
 * La GUÍA PÚBLICA de Mis formularios (`/guia/formularios`): qué dice cada
 * sección y qué captura enseña cada paso. Puro: lo leen la página, el script
 * que toma las capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads y la de Catálogo (armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`):
 * una tarjeta por sección, sus pasos con capturas de la pantalla real y un
 * vídeo de un minuto narrado. Documenta las TRES pantallas del módulo —la
 * lista, el editor de un formulario y sus registros— y el formulario público
 * que ve el cliente.
 *
 * Las listas de abajo (`CIFRAS_DE_LA_LISTA`, `MENU_DE_LA_TARJETA`,
 * `TIPOS_DOCUMENTADOS`…) no son decoración: el banco las compara con lo que
 * pintan los componentes de `/mis-formularios`. Un mando nuevo en la pantalla
 * sin su nombre aquí pone el banco en rojo, que es como se evita que la guía
 * se quede describiendo una pantalla que ya no existe.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Mis formularios en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_FORMULARIOS = "Apps Externas";

/**
 * Las cuatro ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "Tus formularios",
] as const;

/** Las tres cifras de la barra de la lista: son el filtro (`MisFormulariosClient.tsx`). */
export const CIFRAS_DE_LA_LISTA = ["Todos los formularios", "Activos", "Inactivos"] as const;

/** El «⋯» de una tarjeta de la lista, en su orden, con el formulario activo. */
export const MENU_DE_LA_TARJETA = ["Copiar enlace", "Ver formulario", "Desactivar", "Eliminar"] as const;

/** Los campos de la ventana «Nuevo formulario» (y de «Configuración del formulario»). */
export const CAMPOS_DEL_FORMULARIO = ["Título", "Slug (URL)", "Descripción", "Google Sheets URL"] as const;

/** Las tres tarjetas del editor de un formulario, en su orden. */
export const SECCIONES_DEL_EDITOR = ["Campos del formulario", "Redirección a WhatsApp", "URL personalizada"] as const;

/** El «⋯» de la barra del editor, en su orden. */
export const MENU_DEL_EDITOR = ["Ver registros", "Configuración", "Ver formulario"] as const;

/** Los campos de la ventana «Nuevo campo», en su orden. «Opciones» sale solo con los tipos que las piden. */
export const CAMPOS_DEL_CAMPO = ["Pregunta", "Tipo de campo", "Obligatorio", "Texto de ayuda", "Opciones"] as const;

/** Los catorce tipos de campo, con el nombre del desplegable (`TIPOS_DE_CAMPO`, `lib/formularios.ts`). */
export const TIPOS_DOCUMENTADOS = [
    "Texto corto",
    "Área de texto",
    "Desplegable",
    "Selección simple",
    "Selección múltiple",
    "Aceptación (casilla)",
    "Archivo / Documento",
    "Número",
    "Monto / Moneda",
    "Fecha",
    "Hora",
    "Correo electrónico",
    "Teléfono",
    "URL / Enlace",
] as const;

/** Las cuatro cifras de Registros: también son el filtro, y lo hacen en el servidor. */
export const CIFRAS_DE_LOS_REGISTROS = ["Todos los registros", "Sincronizados", "Pendientes", "Con error"] as const;

/** El estado de un registro en Google Sheets, como lo dice su pastilla. */
export const ESTADOS_DEL_REGISTRO = ["Sincronizado", "Pendiente", "Error"] as const;

/** Los botones de una fila de Registros, con el nombre que enseñan al posar el cursor. */
export const ACCIONES_DEL_REGISTRO = ["Ver detalle", "Reintentar en Google Sheets", "Eliminar registro"] as const;

/** El «⋯» de la barra de Registros. */
export const MENU_DE_LOS_REGISTROS = ["Exportar CSV"] as const;

export const GUIA_FORMULARIOS: Contenido = {
    titulo: "Mis formularios",
    subtitulo: "Formularios con tu marca que llenan tus clientes, y sus respuestas en un solo sitio",
    descripcion:
        "Mis formularios crea formularios con las preguntas que necesites —texto, opciones, fechas, archivos— " +
        "y un enlace para compartir. Tus clientes los llenan sin tener cuenta, cada respuesta llega a tus " +
        "registros, puede guardarse sola en Google Sheets y al terminar los lleva a tu WhatsApp.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo y tus formularios.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo · 4 Tus formularios, uno por tarjeta.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Mis formularios con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Mis formularios está dentro de Apps Externas. Al entrar a una " +
                        "pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Mis formularios dentro de Apps Externas",
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
                        "1 El buscador · 2 Todos los formularios · 3 Activos · 4 Inactivos · 5 Nuevo. " +
                        "Las cifras filtran la lista: pulsa una y deja solo esos.",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con cada parte numerada",
                },
                {
                    titulo: "Cada formulario, una tarjeta",
                    texto:
                        "1 Su título y su enlace · 2 Activo o inactivo · 3 El «⋯» · 4 Cuántos campos y registros tiene · " +
                        "5 Editar · 6 Registros.",
                    imagen: "tarjeta.webp",
                    alt: "La tarjeta de un formulario con cada parte numerada",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Mis formularios por Apps Externas.",
                "El buscador busca en el título, el enlace y la descripción, con o sin tildes.",
                "Pasa el cursor por cualquier botón para ver su nombre.",
            ],
        },
        {
            slug: "crear",
            titulo: "Crear un formulario",
            resumen: "Su título, su enlace y una descripción, en una sola ventana.",
            icono: "PlusCircle",
            miniatura: "mini-crear.webp",
            pasos: [
                {
                    titulo: "Pulsa «Nuevo»",
                    texto: "Es el botón azul de la barra de trabajo. Se abre la ventana «Nuevo formulario».",
                    imagen: "crear-boton.webp",
                    alt: "El botón Nuevo resaltado en la barra de trabajo",
                },
                {
                    titulo: "Título, enlace y descripción",
                    texto:
                        "1 El título · 2 El slug, la última parte del enlace: se escribe solo mientras escribes el título · " +
                        "3 La descripción · 4 Google Sheets, si quieres.",
                    imagen: "crear-dialogo.webp",
                    alt: "La ventana Nuevo formulario con sus campos numerados",
                },
                {
                    titulo: "Pulsa «Crear formulario»",
                    texto: "Sale el primero de tu lista, activo y sin preguntas. Pulsa «Editar» para agregarlas.",
                    imagen: "crear-creado.webp",
                    alt: "El formulario recién creado al principio de la lista",
                },
            ],
            consejos: [
                "El slug solo lleva minúsculas, números y guiones: las tildes se quitan solas y los espacios pasan a guiones.",
                "Dos formularios tuyos no pueden tener el mismo slug.",
                "Google Sheets tiene su propia sección: puedes ponerla ahora o después, en Configuración.",
            ],
        },
        {
            slug: "editor",
            titulo: "El editor del formulario",
            resumen: "Dónde se arma el formulario: sus preguntas, WhatsApp y su enlace.",
            icono: "PenLine",
            miniatura: "mini-editor.webp",
            pasos: [
                {
                    titulo: "Pulsa «Editar»",
                    texto:
                        "1 Volver · 2 Activo o inactivo · 3 Nuevo, para agregar una pregunta · 4 El «⋯» · " +
                        "5 Campos del formulario · 6 Redirección a WhatsApp · 7 URL personalizada.",
                    imagen: "editor.webp",
                    alt: "El editor de un formulario con cada parte numerada",
                },
                {
                    titulo: "El «⋯» del editor",
                    texto:
                        "«Ver registros», con cuántos lleva · «Configuración» · «Ver formulario», que lo abre como lo ve tu cliente.",
                    imagen: "editor-menu.webp",
                    alt: "El menú del editor abierto con sus tres opciones",
                },
                {
                    titulo: "Configuración",
                    texto: "Los mismos datos con que lo creaste: Título, Slug (URL), Descripción y Google Sheets URL. «Guardar» los cambia.",
                    imagen: "configuracion.webp",
                    alt: "La ventana Configuración del formulario",
                },
            ],
            consejos: [
                "El interruptor y el orden de las preguntas se guardan al momento; WhatsApp y la URL personalizada llevan su propio botón.",
                "Si el formulario no tiene URL personalizada, cambiar el slug cambia su enlace: vuelve a compartirlo.",
            ],
        },
        {
            slug: "campos",
            titulo: "Agregar las preguntas",
            resumen: "Catorce tipos de campo, obligatorios u opcionales, en el orden que quieras.",
            icono: "ListChecks",
            miniatura: "mini-campos.webp",
            pasos: [
                {
                    titulo: "Pulsa «Nuevo» en el editor",
                    texto: "Se abre «Nuevo campo»: 1 Pregunta · 2 Tipo de campo · 3 Obligatorio · 4 Texto de ayuda, lo que se lee dentro del campo vacío.",
                    imagen: "campo-nuevo.webp",
                    alt: "La ventana Nuevo campo con sus partes numeradas",
                },
                {
                    titulo: "El tipo de campo",
                    texto: "Texto, opciones, casilla, archivo, número, dinero, fecha, hora, correo, teléfono o enlace: catorce tipos.",
                    imagen: "campo-tipos.webp",
                    alt: "El desplegable Tipo de campo abierto",
                },
                {
                    titulo: "Las opciones",
                    texto: "Desplegable, Selección simple y Selección múltiple piden sus Opciones, una por línea.",
                    imagen: "campo-opciones.webp",
                    alt: "Un campo de Selección simple con sus opciones escritas",
                },
                {
                    titulo: "Tus preguntas, en orden",
                    texto:
                        "1 Arrastra por los puntos para cambiar el orden · 2 «Requerido» si es obligatoria · 3 Editar · " +
                        "4 Eliminar, que pide confirmación.",
                    imagen: "campos-lista.webp",
                    alt: "La lista de campos del formulario con sus mandos numerados",
                },
            ],
            consejos: [
                "Los catorce tipos: Texto corto, Área de texto, Desplegable, Selección simple, Selección múltiple, Aceptación (casilla), Archivo / Documento, Número, Monto / Moneda, Fecha, Hora, Correo electrónico, Teléfono y URL / Enlace.",
                "Un Archivo / Documento se sube desde el formulario, hasta 10 MB.",
                "Eliminar una pregunta no borra lo que ya respondieron: en el registro sale como «Campo eliminado».",
            ],
        },
        {
            slug: "whatsapp",
            titulo: "Llevar al cliente a tu WhatsApp",
            resumen: "Al enviar el formulario, tu cliente pasa a tu chat con un mensaje ya escrito.",
            icono: "MessageCircle",
            miniatura: "mini-whatsapp.webp",
            pasos: [
                {
                    titulo: "Enciéndelo",
                    texto: "En «Redirección a WhatsApp», el interruptor «Habilitar redirección automática después del envío».",
                    imagen: "whatsapp-activar.webp",
                    alt: "El interruptor de la redirección a WhatsApp encendido",
                },
                {
                    titulo: "Número y mensaje",
                    texto:
                        "1 Tu número con el código del país · 2 El mensaje que le llega escrito · 3 Pulsa una variable " +
                        "y se añade: se cambia por lo que respondió.",
                    imagen: "whatsapp-mensaje.webp",
                    alt: "El número, la plantilla del mensaje y las variables numerados",
                },
                {
                    titulo: "Guarda",
                    texto: "La vista previa enseña el enlace que se abre. Pulsa «Guardar WhatsApp»; «Cancelar» deshace lo que no guardaste.",
                    imagen: "whatsapp-guardar.webp",
                    alt: "La vista previa del enlace y el botón Guardar WhatsApp",
                },
            ],
            consejos: [
                "Las variables son las preguntas del formulario entre llaves: {{Nombre completo}} se cambia por el nombre que escribió.",
                "Apagarlo también se guarda con «Guardar WhatsApp»: el formulario termina en «¡Registro enviado!» sin abrir WhatsApp.",
            ],
        },
        {
            slug: "url",
            titulo: "Un enlace corto",
            resumen: "Cambia el enlace largo por uno corto y fácil de recordar.",
            icono: "Link2",
            miniatura: "mini-url.webp",
            pasos: [
                {
                    titulo: "Escribe un nombre corto",
                    texto: "En «URL personalizada», después de /f/. Las tildes se quitan y los espacios pasan a guiones.",
                    imagen: "url-escribir.webp",
                    alt: "El nombre corto escrito en la URL personalizada",
                },
                {
                    titulo: "Pulsa «Guardar»",
                    texto: "Debajo sale el enlace completo en azul. La flecha de su derecha lo abre.",
                    imagen: "url-guardada.webp",
                    alt: "El enlace corto guardado, en azul",
                },
                {
                    titulo: "Es el que se comparte",
                    texto: "La tarjeta del formulario ya enseña el enlace corto, y es el que copia «Copiar enlace».",
                    imagen: "url-tarjeta.webp",
                    alt: "La tarjeta del formulario con su enlace corto",
                },
            ],
            consejos: [
                "Un nombre corto es único en toda la plataforma: si otro ya lo usa, sale «Ese nombre ya está en uso».",
                "El enlace largo sigue abriendo el formulario.",
            ],
        },
        {
            slug: "compartir",
            titulo: "Compartir y recibir respuestas",
            resumen: "El enlace, lo que ve tu cliente y lo que pasa al enviarlo.",
            icono: "Share2",
            miniatura: "mini-compartir.webp",
            pasos: [
                {
                    titulo: "Copia el enlace",
                    texto: "En el «⋯» de la tarjeta, «Copiar enlace». Pégalo en WhatsApp, en tu web o en tus redes.",
                    imagen: "compartir-copiar.webp",
                    alt: "El menú de la tarjeta con Copiar enlace resaltado",
                },
                {
                    titulo: "Así lo ve tu cliente",
                    texto: "Arriba el logo y el nombre del negocio, el título y la descripción, y las preguntas. No necesita cuenta.",
                    imagen: "publico.webp",
                    alt: "El formulario público abierto como lo ve el cliente",
                },
                {
                    titulo: "Lo obligatorio",
                    texto: "Las preguntas con * son obligatorias. Si falta alguna, se marca en rojo y el formulario no se envía.",
                    imagen: "publico-obligatorio.webp",
                    alt: "Una pregunta obligatoria sin responder marcada en rojo",
                },
                {
                    titulo: "¡Registro enviado!",
                    texto: "Al pulsar «Enviar formulario» sale este aviso, y la respuesta ya está en tus registros.",
                    imagen: "publico-enviado.webp",
                    alt: "El aviso Registro enviado del formulario público",
                },
            ],
            consejos: [
                "«Ver formulario» en el «⋯» lo abre tal cual, para probarlo antes de compartirlo.",
                "Un formulario inactivo no se abre: el enlace dice que no existe.",
            ],
        },
        {
            slug: "google-sheets",
            titulo: "Guardar las respuestas en Google Sheets",
            resumen: "Cada registro, una fila nueva de tu hoja de cálculo.",
            icono: "FileSpreadsheet",
            miniatura: "mini-google-sheets.webp",
            pasos: [
                {
                    titulo: "Pega el enlace de la hoja",
                    texto: "En «Google Sheets URL», al crear el formulario o después en su Configuración.",
                    imagen: "sheets-url.webp",
                    alt: "El enlace de la hoja pegado en Google Sheets URL",
                },
                {
                    titulo: "Compártela como Editor",
                    texto: "Con el correo que sale debajo del campo: púlsalo y se copia. Sin ese permiso Google no deja escribir.",
                    imagen: "sheets-compartir.webp",
                    alt: "El correo con el que se comparte la hoja, resaltado",
                },
                {
                    titulo: "Cada registro, una fila",
                    texto: "Se escriben en la pestaña con el nombre del formulario; si no existe, se crea. En Registros dice «Sincronizado».",
                    imagen: "sheets-sincronizado.webp",
                    alt: "Registros sincronizados con Google Sheets",
                },
            ],
            consejos: [
                "Los títulos de las columnas son tus preguntas.",
                "Si Google no deja escribir, el registro se guarda igual en la plataforma y queda «Con error» hasta que lo reintentes.",
            ],
        },
        {
            slug: "registros",
            titulo: "Ver los registros",
            resumen: "Cada respuesta que llegó, con su estado y todo lo que contestaron.",
            icono: "ClipboardList",
            miniatura: "mini-registros.webp",
            pasos: [
                {
                    titulo: "Pulsa «Registros»",
                    texto:
                        "1 Volver · 2 Todos los registros · 3 Sincronizados · 4 Pendientes · 5 Con error · 6 Actualizar · 7 El «⋯».",
                    imagen: "registros.webp",
                    alt: "La pantalla de Registros con su barra numerada",
                },
                {
                    titulo: "Cada registro",
                    texto:
                        "1 Su estado en Google Sheets · 2 Su número y un resumen de lo que respondió · 3 La fecha · " +
                        "4 Ver detalle · 5 Eliminar registro.",
                    imagen: "registro-fila.webp",
                    alt: "Un registro con sus partes numeradas",
                },
                {
                    titulo: "Ver detalle",
                    texto: "Cada pregunta con su respuesta. Un archivo sale como enlace: púlsalo para abrirlo.",
                    imagen: "registro-detalle.webp",
                    alt: "La ventana Detalle del registro",
                },
                {
                    titulo: "Los que fallaron",
                    texto: "«Con error» deja solo los que no llegaron a la hoja, con el motivo. «Reintentar en Google Sheets» los vuelve a mandar.",
                    imagen: "registros-error.webp",
                    alt: "Los registros con error y el botón de reintentar",
                },
                {
                    titulo: "Exportar CSV",
                    texto: "En el «⋯», «Exportar CSV» descarga los registros que tienes delante, para abrirlos en Excel.",
                    imagen: "registros-exportar.webp",
                    alt: "El menú de Registros con Exportar CSV",
                },
            ],
            consejos: [
                "Los estados: Sincronizado, ya está en la hoja; Pendiente, todavía no; Error, Google no dejó escribir.",
                "Un formulario sin hoja de Google marca cada registro como Sincronizado: no hay nada que esperar.",
                "Eliminar un registro pide confirmación y no se puede deshacer.",
            ],
        },
        {
            slug: "activar-y-eliminar",
            titulo: "Activar, desactivar y eliminar",
            resumen: "Pausa un formulario sin perder nada, o bórralo con sus registros.",
            icono: "ToggleRight",
            miniatura: "mini-activar-y-eliminar.webp",
            pasos: [
                {
                    titulo: "Desactívalo",
                    texto: "En el «⋯» de la tarjeta, «Desactivar», o con el interruptor del editor. Deja de recibir respuestas.",
                    imagen: "desactivar.webp",
                    alt: "El menú de la tarjeta con Desactivar resaltado",
                },
                {
                    titulo: "Se ve apagado",
                    texto: "La tarjeta dice «Inactivo» y la cifra «Inactivos» lo encuentra. «Activar», en el mismo «⋯», lo vuelve a abrir.",
                    imagen: "inactivo.webp",
                    alt: "Un formulario inactivo en la lista",
                },
                {
                    titulo: "Eliminar",
                    texto: "En el «⋯», «Eliminar». Pide confirmación: se borran el formulario y todos sus registros.",
                    imagen: "eliminar.webp",
                    alt: "La ventana de confirmación para eliminar un formulario",
                },
            ],
            consejos: [
                "Si solo quieres pausarlo, desactívalo: no pierdes ni una respuesta.",
                "Eliminar no se puede deshacer.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("formularios", GUIA_FORMULARIOS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
