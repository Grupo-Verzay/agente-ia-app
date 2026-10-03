/**
 * La GUÍA PÚBLICA de Multiagenda (`/guia/multiagenda`): qué dice cada sección
 * y qué captura enseña cada paso. Puro: lo leen la página, el script que toma
 * las capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads y la de Agenda (armadas con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que
 * pintan los componentes de `/bookings` (las pestañas, los estados, las vistas
 * del calendario, los bloques de un especialista, los campos de un servicio,
 * los pasos de la reserva pública y los ajustes). Un nombre nuevo en la
 * pantalla sin su sitio aquí pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";
import { PESTANAS_DE_MULTIAGENDA } from "@/lib/pantalla-de-multiagenda";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Multiagenda en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_MULTIAGENDA = "Integraciones";

/** Las cuatro ZONAS de la pantalla, tal como las numera «Todo en una pantalla». */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Las pestañas de Multiagenda",
    "Lo que tiene la pestaña abierta",
] as const;

/** Las pestañas, en su orden: salen de la misma lista que pinta la pantalla. */
export const PESTANAS_DOCUMENTADAS = PESTANAS_DE_MULTIAGENDA.map((p) => p.label);

/** Las cifras de la fila de pestañas. El banco las compara con `FIXED_METRICS`. */
export const CIFRAS_DOCUMENTADAS = ["Pendiente", "Confirmada", "Atendida", "Cancelada"] as const;

/** Las vistas del calendario. El banco las compara con `BookingsDashboardCalendar.tsx`. */
export const VISTAS_DEL_CALENDARIO = ["Día", "Semana", "Mes"] as const;

/** Las columnas de la vista Día. */
export const COLUMNAS_DEL_DIA = ["Mañana", "Tarde", "Noche"] as const;

/** Los estados de una reserva: los del desplegable de la ficha y las columnas del Kanban. */
export const ESTADOS_DOCUMENTADOS = [
    "Pendiente",
    "Confirmada",
    "Atendida",
    "No asistida",
    "Cancelada",
    "Finalizado",
    "Descartado",
] as const;

/** Los tres bloques de un especialista abierto, en su orden. */
export const BLOQUES_DEL_ESPECIALISTA = [
    "Servicios que atiende",
    "Disponibilidad semanal",
    "Configuración",
] as const;

/** Los mandos de una franja de horario. El banco los compara con `MembersManager.tsx`. */
export const MANDOS_DE_UNA_FRANJA = ["Añadir franja", "Duplicar franja", "Eliminar franja"] as const;

/** Los campos de la configuración de un especialista. */
export const CAMPOS_DEL_ESPECIALISTA = [
    "Duración de la reunión",
    "Enlace de reunión virtual",
    "Tiempo mínimo de anticipación",
] as const;

/** Los campos de un servicio. El banco los compara con `BookingServicesManager.tsx`. */
export const CAMPOS_DEL_SERVICIO = [
    "Nombre del servicio",
    "Duración (min)",
    "Color",
    "Descripción (opcional)",
    "Mensaje WhatsApp de confirmación",
] as const;

/** Las cuatro clases de archivo de un recordatorio. */
export const ARCHIVOS_DEL_RECORDATORIO = ["Imagen", "Video", "Audio", "Doc."] as const;

/** Las dos tarjetas de Ajustes. */
export const TARJETAS_DE_AJUSTES = ["Enlace público de reservas", "Configuración avanzada"] as const;

/** Los pasos de la página pública de reserva. El banco los compara con `BookingPageClient.tsx`. */
export const PASOS_DE_LA_RESERVA = ["Servicio", "Especialista", "Fecha", "Hora", "Formulario", "Tus datos"] as const;

export const GUIA_MULTIAGENDA: Contenido = {
    titulo: "Multiagenda",
    subtitulo: "Las citas de todo tu equipo, cada especialista con sus horarios y sus servicios",
    descripcion:
        "Multiagenda es la agenda de un equipo: varios especialistas, cada uno con sus días, sus horas y los " +
        "servicios que atiende. Tus clientes reservan solos desde un enlace eligiendo servicio, especialista y hora, " +
        "y la plataforma les recuerda la cita por WhatsApp.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, las pestañas de Multiagenda y lo que tiene cada una.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 Las pestañas de Multiagenda · 4 Lo que tiene la pestaña abierta.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Multiagenda con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Multiagenda está dentro de Integraciones. Al entrar a " +
                        "una pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Multiagenda dentro de Integraciones",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "Las pestañas de Multiagenda",
                    texto:
                        "1 Dashboard · 2 Kanban · 3 Especialistas · 4 Servicios · 5 Recordatorios · 6 Formulario · " +
                        "7 Ajustes.",
                    imagen: "pestanas.webp",
                    alt: "Las siete pestañas de Multiagenda numeradas",
                },
                {
                    titulo: "Las cifras",
                    texto:
                        "A la derecha, cuántas citas tiene tu equipo en Pendiente, Confirmada, Atendida y Cancelada.",
                    imagen: "cifras.webp",
                    alt: "Las cuatro cifras de citas por estado",
                },
            ],
            consejos: [
                "Multiagenda es para un equipo; si atiendes tú solo, Agenda (en Contactos) es más sencilla.",
                "Dashboard y Kanban enseñan las mismas citas: el primero por fecha y el segundo por estado.",
            ],
        },
        {
            slug: "calendario",
            titulo: "El calendario del equipo",
            resumen: "Las citas de todos tus especialistas por día, por semana o por mes.",
            icono: "CalendarRange",
            miniatura: "mini-calendario.webp",
            pasos: [
                {
                    titulo: "La vista Día",
                    texto:
                        "Dashboard abre en Día: las citas de la jornada en Mañana y Tarde, y Noche si hay. Las " +
                        "flechas pasan de día y Hoy (2) te devuelve a hoy. Día (1) es la vista con la que abre.",
                    imagen: "calendario-dia.webp",
                    alt: "El calendario en la vista Día con las citas en Mañana y Tarde",
                },
                {
                    titulo: "Semana y Mes",
                    texto:
                        "Semana y Mes reparten las citas de todo el equipo en la cuadrícula. Cada cita lleva el " +
                        "color de su estado.",
                    imagen: "calendario-semana.webp",
                    alt: "El calendario en la vista Semana",
                },
                {
                    titulo: "Abrir una cita",
                    texto:
                        "Pulsa una cita y se abre su ficha en Detalles (1): el cliente, su teléfono, el servicio, el especialista que " +
                        "la atiende, el estado, la fecha y la hora. Estado (2) es donde se cambia.",
                    imagen: "ficha-detalles.webp",
                    alt: "La ficha de una cita en la pestaña Detalles",
                },
            ],
            consejos: [
                "El calendario usa la zona horaria de tu equipo, no la del cliente.",
                "En la ficha, el teléfono abre la conversación de ese cliente en Chats.",
            ],
        },
        {
            slug: "estado-y-reagendar",
            titulo: "Cambiar el estado y reagendar",
            resumen: "Confirmar, marcar como atendida o cancelada, y mover una cita a otro horario.",
            icono: "ArrowLeftRight",
            miniatura: "mini-estado-y-reagendar.webp",
            pasos: [
                {
                    titulo: "El estado de la cita",
                    texto:
                        "En la ficha, la pestaña Estado: Pendiente, Confirmada, Atendida, No asistida, Cancelada, " +
                        "Finalizado o Descartado. Elige uno y pulsa Actualizar. Al final está Reagendar (1).",
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
                        "Reagendar mueve la MISMA cita: eliges el día (1), una de las horas libres de su especialista (2) " +
                        "y confirmas (3). Conserva su duración y vuelve a programar sus recordatorios.",
                    imagen: "reagendar.webp",
                    alt: "La ventana de Reagendar con la fecha y las horas libres",
                },
            ],
            consejos: [
                "Al cambiar el estado, la plataforma avisa al cliente por WhatsApp.",
                "Una cita reagendada vuelve a Pendiente salvo que estuviera Pendiente o Confirmada.",
            ],
        },
        {
            slug: "kanban",
            titulo: "El Kanban y sus automatizaciones",
            resumen: "Las citas en columnas por estado, y lo que pasa solo cuando una cita entra en cada una.",
            icono: "Columns3",
            miniatura: "mini-kanban.webp",
            pasos: [
                {
                    titulo: "Una columna por estado",
                    texto:
                        "Kanban pone cada cita en la columna de su estado, con cuántas hay arriba (4). Arriba buscas por " +
                        "nombre o teléfono (1) y filtras por servicio (2) o por estado (3).",
                    imagen: "kanban.webp",
                    alt: "El tablero Kanban con sus columnas por estado",
                },
                {
                    titulo: "Mover una cita",
                    texto:
                        "Arrastra una tarjeta a otra columna y cambia de estado, igual que desde la ficha. Su botón " +
                        "Reagendar (1) la mueve a otro horario.",
                    imagen: "kanban-tarjeta.webp",
                    alt: "Una tarjeta de cita en el tablero",
                },
                {
                    titulo: "Automatizaciones",
                    texto:
                        "El engranaje de cada columna abre sus automatizaciones: lo que la plataforma hace sola " +
                        "cuando una cita entra en ese estado, como enviar un mensaje o poner una etiqueta.",
                    imagen: "kanban-automatizaciones.webp",
                    alt: "El panel de automatizaciones de una columna",
                },
            ],
            consejos: [
                "Las columnas son siete: Pendiente, Confirmada, Atendida, No asistida, Cancelada, Finalizado y Descartado.",
                "Las automatizaciones corren igual si cambias el estado desde la ficha o arrastrando la tarjeta.",
            ],
        },
        {
            slug: "especialistas",
            titulo: "Los especialistas",
            resumen: "Quién atiende en tu equipo, en qué horarios y qué servicios hace cada uno.",
            icono: "Users",
            miniatura: "mini-especialistas.webp",
            pasos: [
                {
                    titulo: "Tu equipo",
                    texto:
                        "Especialistas lista a las personas que atienden, con los días que trabaja cada " +
                        "una (3). Arriba dice cuántas son (1), y con Nuevo (2) agregas a alguien con su nombre y una breve descripción.",
                    imagen: "especialistas.webp",
                    alt: "La pestaña Especialistas con su lista",
                },
                {
                    titulo: "Servicios que atiende",
                    texto:
                        "Abre un especialista y elige los servicios que hace: el que está marcado sale en azul. Sin " +
                        "ninguno marcado, aparece en todos los servicios.",
                    imagen: "especialista-servicios.webp",
                    alt: "Los servicios que atiende un especialista",
                },
                {
                    titulo: "Disponibilidad semanal",
                    texto:
                        "Una fila por día con sus franjas de horario: el «+» es Añadir franja (1), y cada franja lleva " +
                        "Duplicar franja (2) y Eliminar franja (3). Un día sin franjas dice No disponible.",
                    imagen: "especialista-disponibilidad.webp",
                    alt: "La disponibilidad semanal de un especialista",
                },
                {
                    titulo: "Su configuración",
                    texto:
                        "En el bloque Configuración, Duración de la reunión (1), Enlace de reunión virtual (2) y Tiempo mínimo de anticipación (3) son de " +
                        "cada especialista: uno puede atender 30 minutos y otro una hora.",
                    imagen: "especialista-configuracion.webp",
                    alt: "La configuración de un especialista",
                },
            ],
            consejos: [
                "Un cliente solo ve las horas de un especialista que caen dentro de sus franjas y no chocan con otra cita suya.",
                "Puedes tener dos franjas el mismo día: por ejemplo, de 8:00 a 12:00 y de 14:00 a 18:00.",
            ],
        },
        {
            slug: "servicios",
            titulo: "Los servicios",
            resumen: "Lo que ofrece tu equipo, con su duración y el mensaje que recibe el cliente al reservar.",
            icono: "Layers",
            miniatura: "mini-servicios.webp",
            pasos: [
                {
                    titulo: "Tus servicios",
                    texto:
                        "Servicios lista lo que ofrece tu equipo, con su color y su duración, y arriba cuántos son (1). " +
                        "Nuevo (2) agrega otro, y la flecha de cada uno (3) enseña qué especialistas lo atienden.",
                    imagen: "servicios.webp",
                    alt: "La pestaña Servicios con su lista",
                },
                {
                    titulo: "Crear un servicio",
                    texto:
                        "Con Nuevo llenas Nombre del servicio (1), Duración (min) (2), Color (3), Descripción (opcional) (4) y " +
                        "Mensaje WhatsApp de confirmación (5), el que recibe quien lo reserva.",
                    imagen: "servicio-nuevo.webp",
                    alt: "El formulario de un servicio nuevo",
                },
                {
                    titulo: "Editar y borrar",
                    texto:
                        "Cada servicio tiene su lápiz para editarlo y su papelera para borrarlo; borrar pide " +
                        "confirmación antes.",
                    imagen: "servicio-mandos.webp",
                    alt: "Un servicio con sus botones de editar y eliminar",
                },
            ],
            consejos: [
                "En el mensaje puedes usar @client_name, @service_name, @appointment_datetime y @appointment_duration.",
            ],
        },
        {
            slug: "recordatorios",
            titulo: "Los recordatorios por servicio",
            resumen: "Los mensajes que tu cliente recibe por WhatsApp antes de su cita, distintos para cada servicio.",
            icono: "Send",
            miniatura: "mini-recordatorios.webp",
            pasos: [
                {
                    titulo: "Recordatorios de cada servicio",
                    texto:
                        "Recordatorios tiene un bloque por servicio con sus mensajes y cuánto antes sale cada uno. " +
                        "Arriba los buscas por título o por texto (1); Nuevo (2) agrega uno a ese servicio, y debajo están los que ya tiene (3).",
                    imagen: "recordatorios.webp",
                    alt: "La pestaña Recordatorios con un bloque por servicio",
                },
                {
                    titulo: "Crear uno",
                    texto:
                        "Con Nuevo de un servicio le pones título (1), mensaje (2) y, si quieres, un archivo (3): " +
                        "imagen, video, audio o documento.",
                    imagen: "recordatorio-nuevo.webp",
                    alt: "El formulario de un recordatorio nuevo",
                },
                {
                    titulo: "Cuánto antes",
                    texto:
                        "Abajo eliges la unidad (1) y cuántas (2): por ejemplo, 1 hora antes de la cita. Pulsa Crear " +
                        "recordatorio y queda en su servicio.",
                    imagen: "recordatorio-tiempo.webp",
                    alt: "El campo de cuánto antes de la cita sale el recordatorio",
                },
            ],
            consejos: [
                "Un servicio sin recordatorios propios usa los de Agenda › Recordatorios.",
                "Si cancelas o reagendas la cita, sus recordatorios se quitan o se vuelven a programar solos.",
            ],
        },
        {
            slug: "formulario",
            titulo: "El formulario por servicio",
            resumen: "Las preguntas que la página de reserva hace antes de agendar cada servicio.",
            icono: "ClipboardList",
            miniatura: "mini-formulario.webp",
            pasos: [
                {
                    titulo: "Un formulario por servicio",
                    texto:
                        "Formulario tiene un bloque por servicio, con sus preguntas (2) y su botón Nuevo (3); arriba " +
                        "buscas un servicio (1). Las preguntas de cada uno solo se hacen a quien reserva ese servicio.",
                    imagen: "formulario.webp",
                    alt: "La pestaña Formulario con un bloque por servicio",
                },
                {
                    titulo: "Crear una pregunta",
                    texto:
                        "Escribe la pregunta (1), elige el tipo (2) —Texto corto, Texto largo o Selección— y si es " +
                        "obligatoria (3). Las de Selección llevan sus opciones (4).",
                    imagen: "pregunta-nueva.webp",
                    alt: "El formulario de una pregunta nueva",
                },
                {
                    titulo: "Encender, apagar y ordenar",
                    texto:
                        "Cada pregunta se enciende o se apaga con su interruptor, y se arrastra para cambiar el " +
                        "orden en que se hace.",
                    imagen: "formulario-preguntas.webp",
                    alt: "Las preguntas de un servicio con sus interruptores",
                },
            ],
            consejos: ["Un servicio sin preguntas se reserva sin el paso Formulario."],
        },
        {
            slug: "ajustes",
            titulo: "Los ajustes",
            resumen: "El enlace público de reservas y la anticipación mínima de todo el equipo.",
            icono: "Settings",
            miniatura: "mini-ajustes.webp",
            pasos: [
                {
                    titulo: "Tu enlace público",
                    texto:
                        "Enlace público de reservas es la dirección de tu página: el botón de copiar (1) la copia para " +
                        "pegarla en un chat o tu web, y el de al lado (2) la abre.",
                    imagen: "ajustes-enlace.webp",
                    alt: "La tarjeta del enlace público de reservas",
                },
                {
                    titulo: "Anticipación mínima",
                    texto:
                        "En Configuración avanzada, el Tiempo mínimo de anticipación, con su unidad (1) y cuántas (2), evita reservas con poco margen: con 2 horas, nadie agenda " +
                        "para dentro de una hora. Cero es sin límite. Guárdalo con Guardar.",
                    imagen: "ajustes-anticipacion.webp",
                    alt: "El campo de tiempo mínimo de anticipación del equipo",
                },
                {
                    titulo: "El del equipo y el de cada uno",
                    texto:
                        "Este vale para todo el equipo. Si un especialista tiene el suyo en su configuración, manda " +
                        "el de él.",
                    imagen: "ajustes.webp",
                    alt: "La pestaña Ajustes con sus dos tarjetas",
                },
            ],
            consejos: ["El enlace no pide contraseña: cualquiera que lo tenga puede reservar."],
        },
        {
            slug: "pagina-publica",
            titulo: "La página pública de reserva",
            resumen: "Lo que ve tu cliente al abrir tu enlace: servicio, especialista, fecha, hora y sus datos.",
            icono: "Link2",
            miniatura: "mini-pagina-publica.webp",
            pasos: [
                {
                    titulo: "Elige el servicio",
                    texto:
                        "Arriba tu cliente ve en qué paso va (1): Servicio, Especialista, Fecha, Hora, Formulario y Tus " +
                        "datos. Empieza eligiendo el servicio (2).",
                    imagen: "reserva-servicio.webp",
                    alt: "La página pública de reserva con la lista de servicios",
                },
                {
                    titulo: "Elige el especialista",
                    texto: "Después elige con quién (1): solo salen los especialistas que hacen ese servicio.",
                    imagen: "reserva-especialista.webp",
                    alt: "La lista de especialistas en la página de reserva",
                },
                {
                    titulo: "Fecha y hora",
                    texto:
                        "Elige el día y una de las horas libres de ese especialista, repartidas en Mañana, Tarde y " +
                        "Noche (1); elige la hora (2) y pulsa Continuar (3).",
                    imagen: "reserva-hora.webp",
                    alt: "Las horas libres de un especialista en la página de reserva",
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
                "Si el servicio tiene preguntas en Formulario, la página las hace antes de los datos del cliente.",
                "A la derecha, el cliente ve un resumen de lo que va eligiendo.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("multiagenda", GUIA_MULTIAGENDA);

export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
