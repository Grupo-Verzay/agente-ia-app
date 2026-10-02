/**
 * La GUÍA PÚBLICA de Campañas (`/guia/campanas`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que pintan
 * los componentes de `/campaigns` (`MainReminders.tsx`, `ReminderList.tsx`,
 * `ReminderForm.tsx`, `CampaignSegmentPanel.tsx`) y con `lib/campanas.ts`. Un
 * mando, una variable o una columna nueva sin su nombre aquí pone el banco en
 * rojo.
 *
 * Y lo que la guía dice que HACE el motor está mirado en el motor
 * (`follow-up-runner` del backend): cada contacto recibe su mensaje con una
 * pausa al azar entre uno y otro, el flujo arranca justo después del mensaje de
 * cada uno, un envío que falla se reintenta hasta tres veces y se queda en el
 * historial con su motivo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Campañas en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_CAMPANAS = "Automatizaciones";

/** Las cuatro ZONAS de la pantalla, en el orden en que se leen. */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "La lista de campañas",
] as const;

/** Las partes de la BARRA DE TRABAJO, con su `data-zona` en `MainReminders.tsx`. */
export const PARTES_DE_LA_BARRA_DE_TRABAJO = [
    { nombre: "Lista o Kanban", zona: "vista" },
    { nombre: "Las cifras", zona: "cifras" },
    { nombre: "Buscador", zona: "buscador" },
    { nombre: "Nuevo", zona: "crear" },
    { nombre: "Acciones masivas", zona: "acciones" },
] as const;

export const VISTAS_DOCUMENTADAS = ["Lista", "Kanban"] as const;
export const CIFRAS_DOCUMENTADAS = ["Pendientes", "Para hoy", "Enviados", "Vencidos"] as const;
export const COLUMNAS_DOCUMENTADAS = ["Pendientes", "Para hoy", "Mañana", "Recurrentes", "Enviados", "Vencidos"] as const;
export const ARCHIVOS_DOCUMENTADOS = ["Imagen", "Video", "Audio", "Doc."] as const;

/** Las variables del mensaje. El banco las compara con `VARIABLES_DE_LA_CAMPANA`. */
export const VARIABLES_DOCUMENTADAS = ["{{nombre}}", "{{telefono}}", "{{fecha}}"] as const;

/** Los estados del lead que segmentan. El banco los compara con `STATUS_OPTIONS`. */
export const ESTADOS_DEL_SEGMENTO = ["Frío", "Tibio", "Caliente", "Finalizado", "Descartado"] as const;

/** Las partes del panel de segmentación, con su `data-zona`. */
export const PARTES_DEL_SEGMENTO = [
    { nombre: "Estado del lead", zona: "estado" },
    { nombre: "Puntaje mínimo", zona: "puntaje" },
    { nombre: "Etiquetas", zona: "etiquetas" },
    { nombre: "Aplicar segmento", zona: "aplicar" },
] as const;

/** Los campos de la ventana de crear, en su orden (`data-campo` de `ReminderForm.tsx`). */
export const CAMPOS_DEL_FORMULARIO = [
    { nombre: "Título", campo: "titulo" },
    { nombre: "Mensaje", campo: "mensaje" },
    { nombre: "Variables", campo: "variables" },
    { nombre: "Archivo multimedia", campo: "archivo" },
    { nombre: "Fecha y hora", campo: "fecha" },
    { nombre: "Sale una sola vez", campo: "una-vez" },
    { nombre: "Segmentación inteligente", campo: "segmento" },
    { nombre: "Pausa entre envíos", campo: "pausa" },
    { nombre: "Contactos", campo: "contactos" },
    { nombre: "Flujo", campo: "flujo" },
] as const;

/** Las partes de UNA campaña de la lista, con su `data-zona` (`ReminderList.tsx`). */
export const PARTES_DE_UNA_CAMPANA = [
    { nombre: "Título", zona: "titulo" },
    { nombre: "A quién le llega", zona: "contacto" },
    { nombre: "Fecha y hora", zona: "hora" },
    { nombre: "Flujo", zona: "flujo" },
    { nombre: "Una sola vez", zona: "repeticion" },
    { nombre: "Adjunto", zona: "media" },
    { nombre: "Envíos", zona: "estado" },
    { nombre: "Editar y eliminar", zona: "mandos" },
] as const;

export const BOTONES_DEL_HISTORIAL = ["Reintentar fallidos", "Pausar pendientes", "Reanudar pausados"] as const;
export const CIFRAS_DEL_HISTORIAL = ["Total", "Enviados", "Pendientes", "Fallidos"] as const;
export const ACCIONES_MASIVAS_DOCUMENTADAS = ["Eliminar todos"] as const;

/** Los botones del aviso de riesgo, en su orden. */
export const BOTONES_DEL_AVISO = ["Cancelar", "Continuar"] as const;

export const GUIA_CAMPANAS: Contenido = {
    titulo: "Campañas",
    subtitulo: "Un mismo mensaje por WhatsApp a muchos contactos, sin mandarlo uno por uno",
    descripcion:
        "Campañas manda un mensaje a varios contactos a la vez: cada uno lo recibe con su nombre, a la hora que " +
        "elijas y con una pausa entre uno y otro para cuidar tu número. Puedes elegir los contactos a mano o por su " +
        "estado y sus etiquetas, sumar una foto, un documento o una nota de voz, y un flujo que arranca después. Cada " +
        "campaña guarda su historial de envíos para ver qué salió, pausar lo que falta o reintentar lo que falló.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo y la lista de tus campañas.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo de Campañas · 4 La lista de campañas.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Campañas con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Campañas está dentro de Automatizaciones. Al entrar a " +
                        "una pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Campañas dentro de Automatizaciones",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La barra de trabajo",
                    texto: "1 Lista o Kanban · 2 Las cifras · 3 Buscador · 4 Nuevo · 5 Acciones masivas.",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con cada parte numerada",
                },
                {
                    titulo: "Una campaña",
                    texto:
                        "1 Título · 2 A quién le llega · 3 Fecha y hora · 4 Flujo · 5 Una sola vez · 6 Adjunto · " +
                        "7 Envíos · 8 Editar y eliminar.",
                    imagen: "tarjeta.webp",
                    alt: "Una campaña de la lista con cada parte numerada",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Campañas por Automatizaciones.",
                "Una campaña sale por WhatsApp, por la línea de tu cuenta, a cada contacto que elijas.",
            ],
        },
        {
            slug: "lista",
            titulo: "La lista",
            resumen: "Todas tus campañas una debajo de otra, con sus cifras y su buscador.",
            icono: "List",
            miniatura: "mini-lista.webp",
            pasos: [
                {
                    titulo: "La vista Lista",
                    texto: "Es la que se abre: cada campaña en su fila, con a cuántos contactos les llega y cuántos envíos han salido.",
                    imagen: "lista.webp",
                    alt: "La vista Lista con varias campañas",
                },
                {
                    titulo: "Las cifras",
                    texto:
                        "1 Pendientes · 2 Para hoy · 3 Enviados · 4 Vencidos. Cuentan tus campañas; si pasas el " +
                        "ratón por una, dice qué cuenta.",
                    imagen: "lista-cifras.webp",
                    alt: "Las cuatro cifras de la barra numeradas",
                },
                {
                    titulo: "El buscador",
                    texto: "Busca por el título, el mensaje o el nombre de un contacto.",
                    imagen: "lista-buscar.webp",
                    alt: "Una búsqueda escrita y la lista con lo que coincide",
                },
                {
                    titulo: "A quién le llega",
                    texto:
                        "La campaña dice a cuántos contactos les llega. Pasa el ratón por encima para ver sus " +
                        "nombres. Si es uno solo, sale su teléfono y abre su chat.",
                    imagen: "lista-contactos.webp",
                    alt: "Los contactos de una campaña resaltados",
                },
            ],
            consejos: [
                "«Vencidos» son las campañas que pasaron su hora sin salir: revisa la línea de tu cuenta.",
                "«Pendientes» son las que faltan de pasado mañana en adelante.",
            ],
        },
        {
            slug: "kanban",
            titulo: "El tablero Kanban",
            resumen: "Las mismas campañas repartidas en columnas: pendientes, hoy, mañana, recurrentes, enviados y vencidos.",
            icono: "Kanban",
            miniatura: "mini-kanban.webp",
            pasos: [
                {
                    titulo: "Pulsa «Kanban»",
                    texto: "Arriba a la izquierda cambias de la lista al tablero, y con «Lista» vuelves.",
                    imagen: "kanban-boton.webp",
                    alt: "El botón Kanban resaltado en la barra",
                },
                {
                    titulo: "Las columnas",
                    texto:
                        "1 Pendientes · 2 Para hoy · 3 Mañana · 4 Recurrentes · 5 Enviados · 6 Vencidos. Cada una " +
                        "dice cuántas tiene.",
                    imagen: "kanban.webp",
                    alt: "El tablero con sus seis columnas numeradas",
                },
                {
                    titulo: "Una campaña en su columna",
                    texto: "La tarjeta enseña lo esencial: título, a cuántos contactos les llega, la hora y sus envíos.",
                    imagen: "kanban-tarjeta.webp",
                    alt: "Una tarjeta del tablero resaltada",
                },
                {
                    titulo: "El engranaje de la columna",
                    texto:
                        "Abre las automatizaciones de esa columna: acciones que se hacen cuando sale una campaña de " +
                        "ese grupo, como poner una etiqueta.",
                    imagen: "kanban-engranaje.webp",
                    alt: "El panel de automatizaciones de una columna abierto",
                },
            ],
            consejos: [
                "Una campaña cambia de columna sola, según se acerca su hora o sale.",
                "Las campañas nuevas salen una sola vez, así que no llegan a Recurrentes: ahí solo quedan las que se programaron para repetirse antes.",
            ],
        },
        {
            slug: "crear",
            titulo: "Crear una campaña",
            resumen: "Un título y un mensaje con el nombre de cada contacto.",
            icono: "PlusCircle",
            miniatura: "mini-crear.webp",
            pasos: [
                {
                    titulo: "Pulsa «Nuevo»",
                    texto: "El botón azul de la barra abre la ventana «Crear campaña».",
                    imagen: "crear-boton.webp",
                    alt: "El botón Nuevo resaltado en la barra",
                },
                {
                    titulo: "Título y mensaje",
                    texto:
                        "El título es para reconocerla en la lista. El mensaje es lo que le llega a cada contacto; " +
                        "si lo dejas vacío, se envía el título.",
                    imagen: "crear-titulo.webp",
                    alt: "El título y el mensaje escritos en la ventana de crear",
                },
                {
                    titulo: "Las variables",
                    texto:
                        "1 {{nombre}} · 2 {{telefono}} · 3 {{fecha}}. Pulsa una y se escribe donde está el cursor. Al " +
                        "enviarse, cada contacto recibe su nombre, su número y la fecha.",
                    imagen: "crear-variables.webp",
                    alt: "Los tres botones de variables numerados",
                },
                {
                    titulo: "Cómo le llega",
                    texto:
                        "«Hola {{nombre}}» le llega a Mariana como «Hola Mariana». Si un contacto no tiene nombre, " +
                        "recibe su número.",
                    imagen: "crear-mensaje.webp",
                    alt: "Un mensaje con la variable del nombre escrita",
                },
            ],
            consejos: [
                "Personaliza el mensaje con {{nombre}}: un mensaje idéntico a muchos contactos es lo que más mira WhatsApp.",
                "Escribe como hablarías con un cliente, no como un anuncio.",
            ],
        },
        {
            slug: "adjunto-y-audio",
            titulo: "Adjuntar un archivo o un audio",
            resumen: "Una foto, un video, un documento o una nota de voz que sale con el mensaje.",
            icono: "Paperclip",
            miniatura: "mini-adjunto-y-audio.webp",
            pasos: [
                {
                    titulo: "Archivo multimedia",
                    texto: "1 Imagen · 2 Video · 3 Audio · 4 Doc. Pulsa el tipo y elige el archivo de tu equipo.",
                    imagen: "adjunto-botones.webp",
                    alt: "Los cuatro botones de archivo numerados",
                },
                {
                    titulo: "El archivo elegido",
                    texto: "Debajo se ve su nombre y su tamaño. La papelera de la derecha lo quita.",
                    imagen: "adjunto-elegido.webp",
                    alt: "Un documento elegido con su nombre y su tamaño",
                },
                {
                    titulo: "Grabar una nota de voz",
                    texto: "«Grabar audio» graba ahí mismo con tu micrófono: 1 pausas, reanudas o detienes, y 2 ves cuánto llevas.",
                    imagen: "adjunto-grabar.webp",
                    alt: "El grabador de audio grabando",
                },
                {
                    titulo: "Escúchala y úsala",
                    texto: "Al detenerla: 1 la escuchas y 2 «Usar grabación» la deja como el archivo de la campaña. «Grabar otra» empieza de nuevo.",
                    imagen: "adjunto-grabacion.webp",
                    alt: "Una grabación lista con los botones para escucharla y usarla",
                },
            ],
            consejos: [
                "El archivo le llega a cada contacto junto a su mensaje.",
                "Solo cabe un archivo por campaña: elegir otro cambia el anterior.",
            ],
        },
        {
            slug: "fecha",
            titulo: "Fecha y hora",
            resumen: "Cuándo sale. Una campaña sale una sola vez.",
            icono: "CalendarClock",
            miniatura: "mini-fecha.webp",
            pasos: [
                {
                    titulo: "La fecha",
                    texto: "Pulsa la fecha y elige el día en el calendario.",
                    imagen: "fecha-calendario.webp",
                    alt: "El calendario abierto para elegir la fecha",
                },
                {
                    titulo: "La hora",
                    texto: "Elige la hora y los minutos. A esa hora empieza a salir: el primer contacto lo recibe una pausa después.",
                    imagen: "fecha-hora.webp",
                    alt: "La hora y los minutos elegidos",
                },
                {
                    titulo: "Sale una sola vez",
                    texto:
                        "Una campaña no se repite: sale en la fecha y hora que elijas, y ya. Para repetir un mensaje " +
                        "a un contacto cada día o cada semana, usa Recordatorios.",
                    imagen: "fecha-una-vez.webp",
                    alt: "El aviso de que la campaña sale una sola vez",
                },
            ],
            consejos: [
                "¿Quieres volver a mandarla? Crea otra campaña con la nueva fecha.",
                "La hora se cuenta en la zona horaria de tu cuenta.",
            ],
        },
        {
            slug: "segmentar",
            titulo: "Segmentar por estado y etiquetas",
            resumen: "Elige a quién le llega por cómo va cada lead, su puntaje y sus etiquetas.",
            icono: "Filter",
            miniatura: "mini-segmentar.webp",
            pasos: [
                {
                    titulo: "Segmentación inteligente",
                    texto: "Pulsa la franja «Segmentación inteligente» para abrirla.",
                    imagen: "segmento-abrir.webp",
                    alt: "La franja de segmentación inteligente resaltada",
                },
                {
                    titulo: "Los filtros",
                    texto:
                        "1 Estado del lead: Frío, Tibio, Caliente, Finalizado o Descartado · 2 Puntaje mínimo · " +
                        "3 Etiquetas · 4 Aplicar segmento. Abajo dice cuántos leads cumplen.",
                    imagen: "segmento.webp",
                    alt: "El panel de segmentación con sus partes numeradas",
                },
                {
                    titulo: "Elige y aplica",
                    texto:
                        "Marca uno o varios estados y etiquetas: entran los leads que tengan cualquiera de ellos. " +
                        "«Aplicar segmento» los pone en la lista de contactos; «Limpiar» quita los filtros.",
                    imagen: "segmento-aplicado.webp",
                    alt: "Un estado y una etiqueta marcados y el número de leads que cumplen",
                },
            ],
            consejos: [
                "Después de aplicar, puedes quitar o sumar contactos a mano.",
                "El puntaje lo pone la IA en Etiquetas, con «Calificar con IA».",
            ],
        },
        {
            slug: "contactos-y-flujo",
            titulo: "Varios contactos y un flujo",
            resumen: "Los contactos que reciben la campaña, y un flujo que arranca después.",
            icono: "Users",
            miniatura: "mini-contactos-y-flujo.webp",
            pasos: [
                {
                    titulo: "Contactos",
                    texto:
                        "Elige uno o varios de tu lista de leads: escribe su nombre o su número para encontrarlos. " +
                        "Cada uno que marques recibe la campaña.",
                    imagen: "contactos-elegir.webp",
                    alt: "La lista de contactos abierta con varios marcados",
                },
                {
                    titulo: "Los elegidos",
                    texto: "El campo dice cuántos contactos van. Puedes volver a abrirlo para quitar o sumar.",
                    imagen: "contactos-elegidos.webp",
                    alt: "El campo de contactos con varios elegidos",
                },
                {
                    titulo: "El flujo",
                    texto:
                        "Opcional: un flujo que arranca solo con cada contacto, justo después de que le llega el " +
                        "mensaje. Escribe su nombre para encontrarlo.",
                    imagen: "flujo-elegir.webp",
                    alt: "La lista de flujos abierta con uno resaltado",
                },
            ],
            consejos: [
                "Los flujos se crean en Crear flujos, dentro de Creación de Flujos.",
                "Úsalo para seguir la conversación: enviar el catálogo, pedir una cita o un pago.",
            ],
        },
        {
            slug: "pausa-y-riesgo",
            titulo: "La pausa entre envíos y el aviso de riesgo",
            resumen: "Cuánto espera entre un contacto y el siguiente, y el aviso antes de crearla.",
            icono: "TriangleAlert",
            miniatura: "mini-pausa-y-riesgo.webp",
            pasos: [
                {
                    titulo: "Pausa entre envíos",
                    texto:
                        "1 El mínimo y 2 el máximo, en segundos, entre 30 y 600. Entre un contacto y el siguiente se " +
                        "espera un tiempo al azar entre los dos, para no parecer un robot.",
                    imagen: "pausa.webp",
                    alt: "La pausa entre envíos con el mínimo y el máximo numerados",
                },
                {
                    titulo: "El aviso de riesgo",
                    texto:
                        "Al pulsar «Crear» sale un aviso: los envíos masivos pueden hacer que WhatsApp suspenda tu " +
                        "número. Léelo con calma: dice qué hacer para cuidarlo.",
                    imagen: "riesgo.webp",
                    alt: "El aviso de riesgo de bloqueo en WhatsApp",
                },
                {
                    titulo: "Continuar o cancelar",
                    texto:
                        "1 «Cancelar» vuelve a la campaña sin crear nada · 2 «Continuar» la crea y queda programada.",
                    imagen: "riesgo-botones.webp",
                    alt: "Los botones Cancelar y Continuar del aviso numerados",
                },
            ],
            consejos: [
                "Manda solo a contactos que te han escrito antes.",
                "Con muchos contactos, sube la pausa: tarda más, pero cuida tu número.",
            ],
        },
        {
            slug: "historial",
            titulo: "El historial de envíos",
            resumen: "Qué salió, qué falta y qué falló, y los mandos para reintentar, pausar y reanudar.",
            icono: "History",
            miniatura: "mini-historial.webp",
            pasos: [
                {
                    titulo: "Los envíos de la campaña",
                    texto: "El botón de la campaña dice cuántos salieron de cuántos, y abre el historial.",
                    imagen: "historial-boton.webp",
                    alt: "El botón de envíos de una campaña resaltado",
                },
                {
                    titulo: "Las cifras",
                    texto: "1 Total · 2 Enviados · 3 Pendientes · 4 Fallidos.",
                    imagen: "historial-cifras.webp",
                    alt: "Las cuatro cifras del historial numeradas",
                },
                {
                    titulo: "Cada envío",
                    texto:
                        "Uno por contacto: su número, su mensaje ya con su nombre, el estado, la hora, los intentos " +
                        "y, si falló, el motivo. Un envío que falla se reintenta solo hasta tres veces.",
                    imagen: "historial-envio.webp",
                    alt: "Un envío del historial con su estado, su hora y sus intentos",
                },
                {
                    titulo: "Reintentar, pausar y reanudar",
                    texto:
                        "1 Reintentar fallidos · 2 Pausar pendientes · 3 Reanudar pausados. Cada uno se enciende " +
                        "cuando hay algo que hacer, y lo que se reanuda o reintenta vuelve a salir con su pausa.",
                    imagen: "historial-mandos.webp",
                    alt: "Los tres botones del historial numerados",
                },
            ],
            consejos: [
                "Un envío pausado no sale hasta que lo reanudas.",
                "Lo que ya salió aparece en Chats, en la conversación con cada contacto.",
            ],
        },
        {
            slug: "editar-y-eliminar",
            titulo: "Editar y eliminar",
            resumen: "Cambia lo que todavía no ha salido, o borra la campaña.",
            icono: "PenLine",
            miniatura: "mini-editar-y-eliminar.webp",
            pasos: [
                {
                    titulo: "El lápiz",
                    texto: "Abre la ventana «Editar campaña» con todo lo que tiene puesto.",
                    imagen: "editar-lapiz.webp",
                    alt: "El lápiz de una campaña resaltado",
                },
                {
                    titulo: "Cambia y pulsa «Actualizar»",
                    texto:
                        "Lo que no ha salido se reprograma con la hora, el mensaje y los contactos nuevos. Lo que ya " +
                        "salió se queda en el historial, y quien ya la recibió no la vuelve a recibir.",
                    imagen: "editar-ventana.webp",
                    alt: "La ventana de editar con el botón Actualizar",
                },
                {
                    titulo: "La papelera",
                    texto: "Elimina la campaña. Siempre pide confirmación, y «Cancelar» no cambia nada.",
                    imagen: "eliminar-confirmar.webp",
                    alt: "La ventana de confirmación para eliminar una campaña",
                },
                {
                    titulo: "Eliminar todos",
                    texto: "En 1 el «⋯» de la barra, 2 «Eliminar todos» borra todas tus campañas de una vez. También pide confirmación.",
                    imagen: "eliminar-todos.webp",
                    alt: "El menú de la barra abierto con Eliminar todos",
                },
            ],
            consejos: ["Eliminar no se puede deshacer."],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("campanas", GUIA_CAMPANAS);

export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
