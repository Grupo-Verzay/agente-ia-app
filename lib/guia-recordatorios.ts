/**
 * La GUÍA PÚBLICA de Recordatorios (`/guia/recordatorios`): qué dice cada
 * sección y qué captura enseña cada paso. Puro: lo leen la página, el script
 * que toma las capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que pintan
 * los componentes de `/reminders` (`MainReminders.tsx`, `ReminderList.tsx`,
 * `ReminderForm.tsx`) y con `lib/repeticion-del-recordatorio.ts`. Una columna,
 * una repetición o un mando nuevo sin su nombre aquí pone el banco en rojo.
 *
 * Y lo que la guía dice que HACE el motor está mirado en el motor
 * (`reminders-runner` y `follow-up-runner` del backend): el mensaje sale a su
 * hora, el flujo arranca justo después, un envío que falla se reintenta hasta
 * tres veces, uno que se repite pasa a su siguiente fecha.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Recordatorios en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_RECORDATORIOS = "Automatizaciones";

/** Las cuatro ZONAS de la pantalla, en el orden en que se leen. */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "La lista de recordatorios",
] as const;

/**
 * Las partes de la BARRA DE TRABAJO, en su orden, con el `data-zona` (o el hueco
 * de `BarraDeAcciones`) donde vive cada una en `MainReminders.tsx`.
 */
export const PARTES_DE_LA_BARRA_DE_TRABAJO = [
    { nombre: "Lista o Kanban", zona: "vista" },
    { nombre: "Las cifras", zona: "cifras" },
    { nombre: "Buscador", zona: "buscador" },
    { nombre: "Nuevo", zona: "crear" },
    { nombre: "Acciones masivas", zona: "acciones" },
] as const;

/** Las dos vistas. El banco las compara con los botones de `data-zona="vista"`. */
export const VISTAS_DOCUMENTADAS = ["Lista", "Kanban"] as const;

/** Las cifras de la barra (no filtran). El banco las compara con `PastillasDeMetricas`. */
export const CIFRAS_DOCUMENTADAS = ["Pendientes", "Para hoy", "Enviados", "Vencidos"] as const;

/** Las columnas del tablero, en su orden. El banco las compara con `kanbanColumns`. */
export const COLUMNAS_DOCUMENTADAS = ["Pendientes", "Para hoy", "Mañana", "Recurrentes", "Enviados", "Vencidos"] as const;

/** Las clases de archivo. El banco las compara con `MEDIA_OPTIONS` de `ReminderForm.tsx`. */
export const ARCHIVOS_DOCUMENTADOS = ["Imagen", "Video", "Audio", "Doc."] as const;

/** Las repeticiones que se ofrecen. El banco las compara con `lasRepeticionesQueSeOfrecen()`. */
export const REPETICIONES_DOCUMENTADAS = [
    "No se repite",
    "Cada día",
    "Cada semana",
    "Cada mes",
    "Cada año",
    "Días laborables (L-V)",
] as const;

/** Los campos de la ventana de crear, en su orden (`data-campo` de `ReminderForm.tsx`). */
export const CAMPOS_DEL_FORMULARIO = [
    { nombre: "Título", campo: "titulo" },
    { nombre: "Mensaje", campo: "mensaje" },
    { nombre: "Archivo multimedia", campo: "archivo" },
    { nombre: "Fecha y hora", campo: "fecha" },
    { nombre: "Repetición", campo: "repeticion" },
    { nombre: "Contacto", campo: "contacto" },
    { nombre: "Flujo (opcional)", campo: "flujo" },
] as const;

/** Las partes de UN recordatorio de la lista, con su `data-zona` (`ReminderList.tsx`). */
export const PARTES_DE_UN_RECORDATORIO = [
    { nombre: "Título", zona: "titulo" },
    { nombre: "Contacto", zona: "contacto" },
    { nombre: "Su teléfono", zona: "telefono" },
    { nombre: "Fecha y hora", zona: "hora" },
    { nombre: "Flujo", zona: "flujo" },
    { nombre: "Repetición", zona: "repeticion" },
    { nombre: "Adjunto", zona: "media" },
    { nombre: "Envíos", zona: "estado" },
    { nombre: "Editar y eliminar", zona: "mandos" },
] as const;

/** Los botones del historial de envíos, en su orden. */
export const BOTONES_DEL_HISTORIAL = ["Reintentar fallidos", "Pausar pendientes", "Reanudar pausados"] as const;

/** Las cifras del historial de envíos, en su orden. */
export const CIFRAS_DEL_HISTORIAL = ["Total", "Enviados", "Pendientes", "Fallidos"] as const;

/** El menú «⋯» de la barra. El banco lo compara con `MainReminders.tsx`. */
export const ACCIONES_MASIVAS_DOCUMENTADAS = ["Eliminar todos"] as const;

export const GUIA_RECORDATORIOS: Contenido = {
    titulo: "Recordatorios",
    subtitulo: "Mensajes que salen solos por WhatsApp, a la hora que tú elijas",
    descripcion:
        "Recordatorios programa un mensaje para un contacto: una fecha, una hora y, si quieres, que se repita. Le " +
        "puedes sumar una foto, un documento o una nota de voz, y un flujo que arranca justo después. Los ves en " +
        "una lista o en un tablero por estado, y cada uno guarda su historial de envíos.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo y la lista de tus recordatorios.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo de Recordatorios · 4 La lista de recordatorios.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Recordatorios con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Recordatorios está dentro de Automatizaciones. Al entrar " +
                        "a una pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Recordatorios dentro de Automatizaciones",
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
                        "1 Lista o Kanban · 2 Las cifras · 3 Buscador · 4 Nuevo · 5 Acciones masivas.",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con cada parte numerada",
                },
                {
                    titulo: "Un recordatorio",
                    texto:
                        "1 Título · 2 Contacto · 3 Su teléfono · 4 Fecha y hora · 5 Flujo · 6 Repetición · 7 Adjunto · " +
                        "8 Envíos · 9 Editar y eliminar.",
                    imagen: "tarjeta.webp",
                    alt: "Un recordatorio de la lista con cada parte numerada",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Recordatorios por Automatizaciones.",
                "Los recordatorios salen por WhatsApp, por la línea del contacto al que se los programas.",
            ],
        },
        {
            slug: "lista",
            titulo: "La lista",
            resumen: "Todos tus recordatorios uno debajo de otro, con sus cifras y su buscador.",
            icono: "List",
            miniatura: "mini-lista.webp",
            pasos: [
                {
                    titulo: "La vista Lista",
                    texto: "Es la que se abre: cada recordatorio en su fila, con todo lo que tiene puesto.",
                    imagen: "lista.webp",
                    alt: "La vista Lista con varios recordatorios",
                },
                {
                    titulo: "Las cifras",
                    texto:
                        "1 Pendientes · 2 Para hoy · 3 Enviados · 4 Vencidos. Cuentan tus recordatorios; si pasas " +
                        "el ratón por una, dice qué cuenta.",
                    imagen: "lista-cifras.webp",
                    alt: "Las cuatro cifras de la barra numeradas",
                },
                {
                    titulo: "El buscador",
                    texto: "Busca por el título, el mensaje, el número o el nombre del contacto.",
                    imagen: "lista-buscar.webp",
                    alt: "Una búsqueda escrita y la lista con lo que coincide",
                },
                {
                    titulo: "Abrir su chat",
                    texto: "El teléfono en azul abre la conversación con ese contacto en Chats.",
                    imagen: "lista-telefono.webp",
                    alt: "El teléfono de un recordatorio resaltado",
                },
            ],
            consejos: [
                "«Vencidos» son los que pasaron su hora sin salir: revisa su contacto y su línea.",
                "«Pendientes» son los que faltan de pasado mañana en adelante.",
            ],
        },
        {
            slug: "kanban",
            titulo: "El tablero Kanban",
            resumen: "Los mismos recordatorios repartidos en columnas por su estado.",
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
                        "1 Pendientes · 2 Para hoy · 3 Mañana · 4 Recurrentes · 5 Enviados · 6 Vencidos. " +
                        "Cada una dice cuántos tiene.",
                    imagen: "kanban.webp",
                    alt: "El tablero con sus seis columnas numeradas",
                },
                {
                    titulo: "Un recordatorio en su columna",
                    texto: "La tarjeta enseña lo esencial: título, repetición, contacto, hora y sus envíos.",
                    imagen: "kanban-tarjeta.webp",
                    alt: "Una tarjeta del tablero resaltada",
                },
                {
                    titulo: "El engranaje de la columna",
                    texto:
                        "Abre las automatizaciones de esa columna: acciones que se hacen cuando sale un recordatorio " +
                        "de ese grupo, como poner una etiqueta o avisar a un asesor.",
                    imagen: "kanban-engranaje.webp",
                    alt: "El panel de automatizaciones de una columna abierto",
                },
            ],
            consejos: [
                "Un recordatorio cambia de columna solo, según se acerca su hora o sale.",
                "Los que se repiten van siempre en Recurrentes.",
            ],
        },
        {
            slug: "crear",
            titulo: "Crear un recordatorio",
            resumen: "Un título, un mensaje y el contacto al que le llega.",
            icono: "PlusCircle",
            miniatura: "mini-crear.webp",
            pasos: [
                {
                    titulo: "Pulsa «Nuevo»",
                    texto: "El botón azul de la barra abre la ventana «Crear recordatorio».",
                    imagen: "crear-boton.webp",
                    alt: "El botón Nuevo resaltado en la barra",
                },
                {
                    titulo: "Título y mensaje",
                    texto:
                        "El título es para reconocerlo en la lista. El mensaje es lo que le llega al contacto; si lo " +
                        "dejas vacío, se envía el título.",
                    imagen: "crear-titulo.webp",
                    alt: "El título y el mensaje escritos en la ventana de crear",
                },
                {
                    titulo: "El contacto",
                    texto:
                        "Elige el contacto de tu lista de leads: escribe su nombre o su número para encontrarlo. " +
                        "Sale por la línea de ese contacto.",
                    imagen: "crear-contacto.webp",
                    alt: "La lista de contactos abierta con uno resaltado",
                },
                {
                    titulo: "Pulsa «Crear»",
                    texto: "El recordatorio aparece en la lista y en la columna que le toca.",
                    imagen: "crear-creado.webp",
                    alt: "El recordatorio recién creado en la lista",
                },
            ],
            consejos: [
                "Escribe @client_name en el mensaje y se cambia por el nombre del contacto al enviarse.",
                "¿El contacto no está? Desde la misma lista puedes crearlo.",
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
                    alt: "El botón Grabar audio resaltado",
                },
                {
                    titulo: "Escúchala y úsala",
                    texto: "Al detenerla: 1 la escuchas y 2 «Usar grabación» la deja como el archivo del recordatorio. «Grabar otra» empieza de nuevo.",
                    imagen: "adjunto-grabacion.webp",
                    alt: "Una grabación lista con los botones para escucharla y usarla",
                },
            ],
            consejos: [
                "El archivo sale junto al mensaje, en el mismo envío.",
                "Solo cabe un archivo por recordatorio: elegir otro cambia el anterior.",
            ],
        },
        {
            slug: "fecha-y-repeticion",
            titulo: "Fecha, hora y repetición",
            resumen: "Cuándo sale, y si vuelve a salir cada día, semana, mes o año.",
            icono: "CalendarClock",
            miniatura: "mini-fecha-y-repeticion.webp",
            pasos: [
                {
                    titulo: "La fecha",
                    texto: "Pulsa la fecha y elige el día en el calendario.",
                    imagen: "fecha-calendario.webp",
                    alt: "El calendario abierto para elegir la fecha",
                },
                {
                    titulo: "La hora",
                    texto: "Elige la hora y los minutos. Se cuentan en la zona horaria de tu cuenta.",
                    imagen: "fecha-hora.webp",
                    alt: "La hora y los minutos elegidos",
                },
                {
                    titulo: "La repetición",
                    texto:
                        "1 No se repite · 2 Cada día · 3 Cada semana · 4 Cada mes · 5 Cada año · " +
                        "6 Días laborables (L-V).",
                    imagen: "fecha-repeticion.webp",
                    alt: "Las opciones de repetición numeradas",
                },
                {
                    titulo: "Cómo se ve en la lista",
                    texto: "La tarjeta dice «Único» o cómo se repite. Uno que se repite pasa a su siguiente fecha cada vez que sale.",
                    imagen: "fecha-en-la-lista.webp",
                    alt: "Un recordatorio que se repite resaltado en la lista",
                },
            ],
            consejos: [
                "«Días laborables» salta el sábado y el domingo.",
                "Uno que no se repite sale una sola vez.",
            ],
        },
        {
            slug: "flujo",
            titulo: "El flujo asociado",
            resumen: "Un flujo que arranca solo, justo después de que sale el mensaje.",
            icono: "GitBranch",
            miniatura: "mini-flujo.webp",
            pasos: [
                {
                    titulo: "Flujo (opcional)",
                    texto: "En la ventana de crear, al lado del contacto. Escribe su nombre para encontrarlo.",
                    imagen: "flujo-elegir.webp",
                    alt: "La lista de flujos abierta con uno resaltado",
                },
                {
                    titulo: "El flujo elegido",
                    texto: "Queda puesto en el campo. Si no eliges ninguno, solo sale el mensaje.",
                    imagen: "flujo-elegido.webp",
                    alt: "El flujo elegido en su campo",
                },
                {
                    titulo: "En la lista",
                    texto: "La tarjeta dice qué flujo tiene. Arranca justo después de que el mensaje le llega al contacto.",
                    imagen: "flujo-en-la-lista.webp",
                    alt: "El flujo de un recordatorio resaltado en la lista",
                },
            ],
            consejos: [
                "Los flujos se crean en Crear flujos, dentro de Creación de Flujos.",
                "Úsalo para seguir la conversación: confirmar una cita, pedir un pago, enviar un catálogo.",
            ],
        },
        {
            slug: "historial",
            titulo: "El historial de envíos",
            resumen: "Qué está por salir, qué falló y por qué, y los mandos para pausarlo o reintentarlo.",
            icono: "History",
            miniatura: "mini-historial.webp",
            pasos: [
                {
                    titulo: "Los envíos de la tarjeta",
                    texto: "El botón de la tarjeta dice cuántos salieron de cuántos, y abre el historial.",
                    imagen: "historial-boton.webp",
                    alt: "El botón de envíos de un recordatorio resaltado",
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
                        "El contacto, el mensaje, el archivo, su estado, la hora, los intentos y, si falló, el motivo. " +
                        "Un envío que falla se reintenta hasta tres veces.",
                    imagen: "historial-envio.webp",
                    alt: "Un envío del historial con su estado, su hora y sus intentos",
                },
                {
                    titulo: "Pausar, reanudar y reintentar",
                    texto:
                        "1 Reintentar fallidos · 2 Pausar pendientes · 3 Reanudar pausados. Cada uno se enciende " +
                        "cuando hay algo que hacer.",
                    imagen: "historial-mandos.webp",
                    alt: "Los tres botones del historial numerados",
                },
            ],
            consejos: [
                "Un envío pausado no sale hasta que lo reanudas.",
                "Lo que ya salió aparece en Chats, en la conversación con ese contacto.",
            ],
        },
        {
            slug: "editar-y-eliminar",
            titulo: "Editar y eliminar",
            resumen: "Cambia lo que quieras de un recordatorio, o bórralo.",
            icono: "PenLine",
            miniatura: "mini-editar-y-eliminar.webp",
            pasos: [
                {
                    titulo: "El lápiz",
                    texto: "Abre la ventana «Editar recordatorio» con todo lo que tiene puesto.",
                    imagen: "editar-lapiz.webp",
                    alt: "El lápiz de un recordatorio resaltado",
                },
                {
                    titulo: "Cambia y pulsa «Actualizar»",
                    texto: "Si cambias la fecha o el mensaje, su envío pendiente se mueve con él.",
                    imagen: "editar-ventana.webp",
                    alt: "La ventana de editar con el botón Actualizar",
                },
                {
                    titulo: "La papelera",
                    texto: "Elimina el recordatorio. Siempre pide confirmación, y «Cancelar» no cambia nada.",
                    imagen: "eliminar-confirmar.webp",
                    alt: "La ventana de confirmación para eliminar un recordatorio",
                },
                {
                    titulo: "Eliminar todos",
                    texto: "En 1 el «⋯» de la barra, 2 «Eliminar todos» borra todos tus recordatorios de una vez. También pide confirmación.",
                    imagen: "eliminar-todos.webp",
                    alt: "El menú de la barra abierto con Eliminar todos",
                },
            ],
            consejos: ["Eliminar no se puede deshacer."],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("recordatorios", GUIA_RECORDATORIOS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
