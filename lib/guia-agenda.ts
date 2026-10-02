/**
 * La GUÍA PÚBLICA de Agenda (`/guia/agenda`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`):
 * una tarjeta por sección, sus pasos con capturas de la pantalla real y un
 * vídeo de un minuto narrado.
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que
 * pintan los componentes de `/schedule` (las pestañas, los estados de una
 * cita, las vistas del calendario, los pasos de la reserva pública, los tipos
 * de pregunta y los campos de Ajustes). Un nombre nuevo en la pantalla sin su
 * sitio aquí pone el banco en rojo, que es como se evita que la guía se quede
 * describiendo una pantalla que ya no existe.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";
import { PESTANAS_DE_LA_AGENDA, ROTULO_DEL_TIEMPO_ANTES_DE_LA_CITA } from "@/lib/pantalla-de-agenda";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Agenda en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_AGENDA = "Contactos";

/**
 * Las cuatro ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Las pestañas de Agenda",
    "Lo que tiene la pestaña abierta",
] as const;

/** Las pestañas, en su orden: salen de la misma lista que pinta la pantalla. */
export const PESTANAS_DOCUMENTADAS = PESTANAS_DE_LA_AGENDA.map((p) => p.label);

/** Las cifras fijas de la fila de pestañas. El banco las compara con `FIXED_METRICS`. */
export const CIFRAS_DOCUMENTADAS = ["Pendiente", "Confirmada", "Atendida", "Cancelada"] as const;

/** Las cifras de la pestaña Registros. El banco las compara con `bookingMetrics`. */
export const CIFRAS_DE_REGISTROS = ["Total registros", "Sincronizados", "Pendientes", "Esta semana"] as const;

/** Las vistas del calendario. El banco las compara con `CustomCalendar.tsx`. */
export const VISTAS_DEL_CALENDARIO = ["Día", "Semana", "Mes"] as const;

/**
 * Los estados de una cita, en su orden: los del desplegable de la ficha y las
 * columnas del Kanban, que son los mismos.
 */
export const ESTADOS_DOCUMENTADOS = [
    "Pendiente",
    "Confirmada",
    "Atendida",
    "No asistida",
    "Cancelada",
    "Finalizado",
    "Descartado",
] as const;

/** Los mandos de un día en Disponibilidad. El banco los compara con `UserAvailabilityForm.tsx`. */
export const MANDOS_DE_UN_PERIODO = ["Añadir otro periodo", "Duplicar periodo", "Eliminar periodo"] as const;

/** Los dos botones del enlace de reserva. El banco los compara con `ShareScheduleLinkButton.tsx`. */
export const BOTONES_DEL_ENLACE = ["Ver página citas", "Copiar enlace"] as const;

/** Los pasos de la página pública de reserva. El banco los compara con `SchedulePageClient.tsx`. */
export const PASOS_DE_LA_RESERVA = ["Servicio", "Fecha", "Hora", "Formulario", "Tus datos"] as const;

/** Los tipos de una pregunta del formulario. El banco los compara con `BookingFormBuilder.tsx`. */
export const TIPOS_DE_PREGUNTA = ["Texto corto", "Texto largo", "Selección"] as const;

/** Los campos de «Configuración de Reunión». El banco los compara con `UpdateMeetingDuration.tsx`. */
export const CAMPOS_DE_LA_REUNION = [
    "Duración de la reunión",
    "Enlace de reunión virtual",
    "Tiempo mínimo de anticipación",
] as const;

/** Los tres pasos de Google Calendar. El banco los compara con `GoogleCalendarSettings.tsx`. */
export const PASOS_DE_GOOGLE_CALENDAR = [
    "Comparte tu calendario con este correo",
    "ID de tu calendario",
    "Sincronización activa",
] as const;

export const GUIA_AGENDA: Contenido = {
    titulo: "Agenda",
    subtitulo: "Tus citas, tus horarios y tu enlace de reserva en un solo lugar",
    descripcion:
        "Agenda reúne las citas de tus clientes en un calendario y en un tablero por estado. Defines en qué horarios " +
        "atiendes, compartes un enlace para que te reserven solos, y la plataforma les recuerda la cita por WhatsApp " +
        "antes de que llegue.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, las pestañas de Agenda y lo que tiene cada una.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 Las pestañas de Agenda · 4 Lo que tiene la pestaña abierta.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Agenda con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Agenda está dentro de Contactos. Al entrar a una " +
                        "pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Agenda dentro de Contactos",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "Las pestañas de Agenda",
                    texto:
                        "1 Dashboard · 2 Disponibilidad · 3 Kanban · 4 Servicios · 5 Recordatorios · 6 Formulario · " +
                        "7 Registros · 8 Ajustes.",
                    imagen: "pestanas.webp",
                    alt: "Las ocho pestañas de Agenda numeradas",
                },
                {
                    titulo: "Las cifras",
                    texto:
                        "A la derecha, cuántas citas tienes en Pendiente, Confirmada, Atendida y Cancelada. En " +
                        "Registros cambian a las respuestas del formulario.",
                    imagen: "cifras.webp",
                    alt: "Las cuatro cifras de citas por estado",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Agenda por Contactos.",
                "Dashboard y Kanban enseñan las mismas citas: el primero por fecha y el segundo por estado.",
            ],
        },
        {
            slug: "calendario",
            titulo: "El calendario de citas",
            resumen: "Tus citas por día, por semana o por mes, y la ficha de cada una.",
            icono: "CalendarRange",
            miniatura: "mini-calendario.webp",
            pasos: [
                {
                    titulo: "La vista Día",
                    texto:
                        "Dashboard abre en Día: las citas de la jornada en dos columnas, Mañana y Tarde. Las flechas " +
                        "pasan de día y Hoy te devuelve a hoy.",
                    imagen: "calendario-dia.webp",
                    alt: "El calendario en la vista Día con las citas en Mañana y Tarde",
                },
                {
                    titulo: "Semana y Mes",
                    texto:
                        "Semana y Mes reparten las citas en la cuadrícula del calendario. Cada cita lleva el color " +
                        "de su estado.",
                    imagen: "calendario-semana.webp",
                    alt: "El calendario en la vista Semana",
                },
                {
                    titulo: "Abrir una cita",
                    texto:
                        "Pulsa una cita y se abre su ficha: el cliente, su teléfono, el servicio, el estado, la fecha, " +
                        "la hora y la zona horaria.",
                    imagen: "ficha-detalles.webp",
                    alt: "La ficha de una cita en la pestaña Detalles",
                },
            ],
            consejos: [
                "El calendario usa la zona horaria de tu cuenta, no la del cliente.",
                "Desde la ficha también puedes eliminar la cita; la plataforma te pide confirmarlo antes.",
            ],
        },
        {
            slug: "estado-y-reagendar",
            titulo: "Cambiar el estado y reagendar",
            resumen: "Confirmar, marcar como atendida o cancelada, y mover una cita a otra fecha.",
            icono: "ArrowLeftRight",
            miniatura: "mini-estado-y-reagendar.webp",
            pasos: [
                {
                    titulo: "El estado de la cita",
                    texto:
                        "En la ficha, la pestaña Estado: Pendiente, Confirmada, Atendida, No asistida, Cancelada, " +
                        "Finalizado o Descartado. Elige uno y pulsa Actualizar.",
                    imagen: "ficha-estado.webp",
                    alt: "El desplegable de estados de una cita abierto",
                },
                {
                    titulo: "Cancelar",
                    texto:
                        "Cancelar pide confirmación: al hacerlo se quitan los recordatorios que esa cita tenía " +
                        "pendientes, para que al cliente no le llegue nada más.",
                    imagen: "cancelar.webp",
                    alt: "La ventana que confirma la cancelación de una cita",
                },
                {
                    titulo: "Reagendar",
                    texto:
                        "Reagendar, al final del desplegable, mueve la MISMA cita a otro día y hora libres. Conserva " +
                        "su duración y vuelve a programar sus recordatorios.",
                    imagen: "reagendar.webp",
                    alt: "La ventana de Reagendar con la fecha y las horas libres",
                },
            ],
            consejos: [
                "Al cambiar el estado, la plataforma avisa al cliente por WhatsApp desde la línea de su conversación.",
                "Una cita reagendada vuelve a Pendiente salvo que estuviera Pendiente o Confirmada.",
            ],
        },
        {
            slug: "disponibilidad",
            titulo: "Configurar tu disponibilidad",
            resumen: "Los días y las horas en que atiendes, que son los que tus clientes pueden reservar.",
            icono: "ListChecks",
            miniatura: "mini-disponibilidad.webp",
            pasos: [
                {
                    titulo: "Tus horarios",
                    texto:
                        "Disponibilidad tiene una fila por día, de lunes a domingo. Cada periodo es un horario de " +
                        "atención; un día sin periodos dice No disponible.",
                    imagen: "disponibilidad.webp",
                    alt: "La pestaña Disponibilidad con los horarios de cada día",
                },
                {
                    titulo: "Añadir y cambiar un periodo",
                    texto:
                        "El «+» junto al día (1) es Añadir otro periodo. La hora de inicio (2) y la de fin (3) se eligen " +
                        "en sus desplegables, y el cambio se guarda solo.",
                    imagen: "disponibilidad-periodo.webp",
                    alt: "El botón de añadir periodo y las horas de inicio y fin de un periodo",
                },
                {
                    titulo: "Duplicar y eliminar",
                    texto:
                        "Cada periodo lleva Duplicar periodo, para repetir el horario, y Eliminar periodo. Borra " +
                        "todos los de un día y ese día deja de recibir citas.",
                    imagen: "disponibilidad-mandos.webp",
                    alt: "Los botones de duplicar y eliminar de un periodo",
                },
            ],
            consejos: [
                "Puedes tener varios periodos el mismo día: por ejemplo, de 8:00 a 12:00 y de 14:00 a 18:00.",
                "La página de reserva solo ofrece horas dentro de tus periodos y que no choquen con otra cita.",
            ],
        },
        {
            slug: "enlace-publico",
            titulo: "El enlace público de reserva",
            resumen: "La página donde tus clientes eligen servicio, día y hora, y reservan solos.",
            icono: "Link2",
            miniatura: "mini-enlace-publico.webp",
            pasos: [
                {
                    titulo: "Tu enlace",
                    texto:
                        "Arriba de Disponibilidad: Ver página citas abre tu página de reserva y Copiar enlace la " +
                        "copia para pegarla en un chat, tu web o tus redes.",
                    imagen: "enlace-botones.webp",
                    alt: "Los botones Ver página citas y Copiar enlace",
                },
                {
                    titulo: "Lo que ve tu cliente",
                    texto:
                        "Tu cliente elige el servicio, la fecha y la hora (2) entre las que tienes libres. Arriba ve " +
                        "en qué paso va (1): Servicio, Fecha, Hora, Formulario y Tus datos.",
                    imagen: "reserva-hora.webp",
                    alt: "La página pública de reserva con las horas libres",
                },
                {
                    titulo: "Sus datos y la cita",
                    texto:
                        "Al final deja su nombre (1), su país (2) y su WhatsApp (3) y pulsa Confirmar (4). La cita " +
                        "entra en tu calendario como Pendiente y le llega su confirmación.",
                    imagen: "reserva-datos.webp",
                    alt: "El último paso de la reserva, con el nombre y el WhatsApp del cliente",
                },
            ],
            consejos: [
                "El enlace no pide contraseña: cualquiera que lo tenga puede reservar.",
                "Si tienes preguntas en Formulario, la página las hace antes de los datos del cliente.",
            ],
        },
        {
            slug: "kanban",
            titulo: "El tablero Kanban",
            resumen: "Tus citas en columnas por estado, que mueves arrastrando.",
            icono: "Columns3",
            miniatura: "mini-kanban.webp",
            pasos: [
                {
                    titulo: "Una columna por estado",
                    texto:
                        "Kanban pone cada cita en la columna de su estado, con cuántas hay arriba. Arriba buscas por " +
                        "nombre o teléfono y filtras por etiqueta.",
                    imagen: "kanban.webp",
                    alt: "El tablero Kanban con sus columnas por estado",
                },
                {
                    titulo: "Mover una cita",
                    texto:
                        "Arrastra una tarjeta a otra columna y cambia de estado, igual que desde la ficha. Su botón " +
                        "Reagendar la mueve a otra fecha.",
                    imagen: "kanban-tarjeta.webp",
                    alt: "Una tarjeta de cita en el tablero",
                },
                {
                    titulo: "Automatizaciones",
                    texto:
                        "El engranaje de cada columna abre sus automatizaciones: lo que la plataforma hace sola " +
                        "cuando una cita entra en ese estado.",
                    imagen: "kanban-automatizaciones.webp",
                    alt: "El panel de automatizaciones de una columna",
                },
            ],
            consejos: [
                "Las columnas son siete: Pendiente, Confirmada, Atendida, No asistida, Cancelada, Finalizado y Descartado.",
            ],
        },
        {
            slug: "servicios",
            titulo: "Los servicios",
            resumen: "Lo que ofreces en tus citas, con el mensaje que recibe el cliente al reservar.",
            icono: "Layers",
            miniatura: "mini-servicios.webp",
            pasos: [
                {
                    titulo: "Tus servicios",
                    texto:
                        "Servicios lista lo que ofreces, con su mensaje. Arriba buscas, ves cuántos tienes y creas " +
                        "uno con Nuevo.",
                    imagen: "servicios.webp",
                    alt: "La pestaña Servicios con su lista",
                },
                {
                    titulo: "Crear un servicio",
                    texto:
                        "Escribe el nombre del servicio (1) y el mensaje automático para WhatsApp (2) que recibe quien " +
                        "lo reserva, y pulsa Guardar (3).",
                    imagen: "servicio-nuevo.webp",
                    alt: "El formulario de un servicio nuevo",
                },
                {
                    titulo: "Editar, borrar y ordenar",
                    texto:
                        "Cada servicio tiene su lápiz para editarlo y su papelera para borrarlo. Arrástralos para " +
                        "cambiar el orden en que salen al reservar.",
                    imagen: "servicio-mandos.webp",
                    alt: "Un servicio con sus botones de editar y eliminar",
                },
            ],
            consejos: ["El orden de la lista es el orden en que tu cliente ve los servicios en la página de reserva."],
        },
        {
            slug: "recordatorios",
            titulo: "Los recordatorios antes de la cita",
            resumen: "Los mensajes que tu cliente recibe por WhatsApp antes de su cita.",
            icono: "Send",
            miniatura: "mini-recordatorios.webp",
            pasos: [
                {
                    titulo: "Tus recordatorios",
                    texto:
                        "Recordatorios guarda los mensajes que salen solos antes de cada cita. Arriba buscas (1) y " +
                        "creas uno con Nuevo (2); cada uno dice cuánto antes sale.",
                    imagen: "recordatorios.webp",
                    alt: "La pestaña Recordatorios con su lista",
                },
                {
                    titulo: "Crear uno",
                    texto:
                        "Con Nuevo le pones título y mensaje, y si quieres un archivo o una nota de voz que grabas " +
                        "ahí mismo.",
                    imagen: "recordatorio-nuevo.webp",
                    alt: "El formulario de un recordatorio nuevo",
                },
                {
                    titulo: "Cuánto antes",
                    texto: `«${ROTULO_DEL_TIEMPO_ANTES_DE_LA_CITA}» dice cuándo sale: la unidad (1) —minutos, horas o días— y cuántas (2). Por ejemplo, 2 horas antes de la cita.`,
                    imagen: "recordatorio-tiempo.webp",
                    alt: "El campo de cuánto antes de la cita sale el recordatorio",
                },
            ],
            consejos: [
                "Un recordatorio cuya hora ya pasó cuando se agenda la cita no se envía.",
                "Si cancelas la cita, sus recordatorios pendientes se quitan solos.",
            ],
        },
        {
            slug: "formulario-y-registros",
            titulo: "El formulario y sus registros",
            resumen: "Las preguntas que haces al reservar y las respuestas que dejan tus clientes.",
            icono: "ClipboardList",
            miniatura: "mini-formulario-y-registros.webp",
            pasos: [
                {
                    titulo: "Tus preguntas",
                    texto:
                        "Formulario guarda las preguntas de calificación que la página de reserva hace antes de " +
                        "agendar. Cada una se enciende o se apaga con su interruptor.",
                    imagen: "formulario.webp",
                    alt: "La pestaña Formulario con sus preguntas",
                },
                {
                    titulo: "Crear una pregunta",
                    texto:
                        "Con Nuevo escribes la pregunta (1), eliges el tipo (2) —Texto corto, Texto largo o Selección— " +
                        "y si es obligatoria (3). Las de Selección llevan sus opciones (4).",
                    imagen: "pregunta-nueva.webp",
                    alt: "El formulario de una pregunta nueva",
                },
                {
                    titulo: "Los registros",
                    texto:
                        "Registros guarda cada respuesta con el nombre, el número y la cita. Arriba ves Total registros, " +
                        "Sincronizados, Pendientes y Esta semana.",
                    imagen: "registros.webp",
                    alt: "La pestaña Registros con las respuestas recibidas",
                },
                {
                    titulo: "Ver una respuesta",
                    texto:
                        "Ver detalle abre lo que respondió el cliente, con su cita y su servicio. Exportar CSV " +
                        "descarga todas las respuestas.",
                    imagen: "registro-detalle.webp",
                    alt: "El detalle de un registro con las respuestas del formulario",
                },
            ],
            consejos: [
                "Sincronizado quiere decir que la respuesta ya se copió a tu hoja de Google Sheets.",
                "Arrastra las preguntas para cambiar el orden en que se hacen.",
            ],
        },
        {
            slug: "ajustes",
            titulo: "Los ajustes",
            resumen: "La duración de la cita, el enlace de la reunión y la conexión con Google Calendar.",
            icono: "Settings",
            miniatura: "mini-ajustes.webp",
            pasos: [
                {
                    titulo: "La reunión",
                    texto:
                        "Duración de la reunión es lo que dura cada cita. Enlace de reunión virtual es el de tu " +
                        "Zoom o Google Meet, que se le envía al cliente.",
                    imagen: "ajustes-reunion.webp",
                    alt: "La tarjeta Configuración de Reunión",
                },
                {
                    titulo: "El aviso mínimo",
                    texto:
                        "Tiempo mínimo de anticipación evita que te reserven con poco margen: con 2 horas, nadie " +
                        "agenda para dentro de una hora. Cero es sin límite.",
                    imagen: "ajustes-anticipacion.webp",
                    alt: "El campo de tiempo mínimo de anticipación",
                },
                {
                    titulo: "Google Calendar",
                    texto:
                        "Comparte tu calendario con el correo que se ve, pega el ID de tu calendario y enciende " +
                        "Sincronización activa: tus citas pasan a Google Calendar.",
                    imagen: "ajustes-google-calendar.webp",
                    alt: "La tarjeta de Google Calendar con sus tres pasos",
                },
            ],
            consejos: [
                "Cada tarjeta se guarda con su propio botón Guardar.",
                "El ID de tu calendario suele ser tu mismo correo de Google.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("agenda", GUIA_AGENDA);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
