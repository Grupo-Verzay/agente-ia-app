/**
 * La GUÍA PÚBLICA de Conexión y Ajustes (`/guia/conexion`): qué dice cada
 * sección y qué captura enseña cada paso. Puro: lo leen la página, el script
 * que toma las capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 * La pantalla (`/profile`) es UNA con ocho pestañas internas, y la guía lleva
 * un apartado por pestaña, en el mismo orden.
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que
 * pintan los componentes de `/profile` (las pestañas, los canales, las
 * tarjetas de cada pestaña y sus mandos). Un nombre nuevo en la pantalla sin
 * su sitio aquí pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";
import { PESTANAS_DEL_PERFIL } from "@/lib/pantalla-de-perfil";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive la pantalla en el menú: es una entrada propia, sin desplegable. */
export const MODULO_DE_CONEXION = "Conexión→ Ajustes";

/** Las ZONAS de la pantalla, en el orden en que se leen. */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La ficha de tu cuenta",
    "Las pestañas",
    "Lo que tiene la pestaña abierta",
] as const;

/** Las pestañas, en su orden: salen de la misma lista que pinta la pantalla. */
export const PESTANAS_DOCUMENTADAS = PESTANAS_DEL_PERFIL.map((p) => p.label);

/** Los canales de la pestaña Conexión, en su orden. */
export const CANALES_DOCUMENTADOS = [
    "Mensajería WhatsApp (QR)",
    "Llamadas WhatsApp (QR)",
    "WhatsApp Cloud API",
    "Mensajería Telegram",
    "Mensajería Facebook",
    "Mensajería Instagram",
] as const;

/** Las tarjetas de cada pestaña, tal como se titulan en pantalla. */
export const TARJETAS_DE_CADA_PESTANA = {
    integraciones: ["Proveedor de IA", "Contactos de notificación"],
    preferencias: ["Zona horaria", "Empresa", "URL de Google Maps"],
    comportamiento: [
        "Estado del agente",
        "Escalado a un asesor",
        "Encuesta de satisfacción",
        "Análisis de sentimiento",
        "Tiempos de respuesta",
        "Frases automáticas",
        "Funciones avanzadas",
    ],
    cuenta: ["Plan actual", "Créditos IA", "Sesión activa", "Cerrar sesión"],
    seguridad: ["Cambio de correo", "Seguridad"],
    apariencia: ["Tu logo", "Tema del panel", "Tamaño de letra", "Modo de color"],
} as const;

/** Los tres interruptores del escalado. El banco los compara con `EscaladoCard.tsx`. */
export const OPCIONES_DEL_ESCALADO = [
    "Permitir que la IA escale sola",
    "Apagar la IA al escalar",
    "Soltar si nadie responde",
] as const;

/** Los tiempos y las frases de Comportamiento. */
export const TIEMPOS_Y_FRASES = [
    "Reactivación automática",
    "Retraso de respuesta IA",
    "Frase de reactivación",
    "Frase de desactivación",
] as const;

/** El botón redondo de Cuenta. El banco lo compara con `PlanSpeedDial.tsx`. */
export const ACCIONES_DEL_PLAN = ["Cambiar plan", "Comprar créditos", "Cancelar plan"] as const;

/** Los campos de Seguridad. */
export const CAMPOS_DEL_CORREO = ["Nuevo correo", "Confirmar correo"] as const;
export const CAMPOS_DE_LA_CONTRASENA = ["Contraseña actual", "Nueva contraseña", "Confirmar contraseña"] as const;

/** Las opciones de Apariencia. */
export const TAMANOS_DE_LETRA = ["Normal", "Grande", "Más grande"] as const;
export const MODOS_DE_COLOR = ["Claro", "Sistema", "Oscuro"] as const;

export const GUIA_CONEXION: Contenido = {
    titulo: "Conexión y Ajustes",
    subtitulo: "Tus canales, tu IA y los ajustes de tu cuenta en una sola pantalla",
    descripcion:
        "Conexión y Ajustes es donde conectas WhatsApp y tus otros canales, pones la clave de tu IA, decides cómo " +
        "se comporta tu agente y revisas tu plan, tus créditos, tu seguridad y el aspecto del panel. Son ocho " +
        "pestañas en una misma pantalla.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la ficha de tu cuenta y las ocho pestañas.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba · 3 La ficha de tu cuenta · " +
                        "4 Las pestañas · 5 Lo que tiene la pestaña abierta.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Conexión y Ajustes con sus cinco partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        `Todos los módulos de la plataforma. Esta pantalla es la entrada ${MODULO_DE_CONEXION}, la del ` +
                        "engranaje. Al entrar, el menú se recoge en sus iconos; las dos flechas lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con la entrada de Conexión y Ajustes",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La ficha de tu cuenta",
                    texto:
                        "Arriba, tu nombre y tu rol (1), los días de licencia y los créditos que te quedan (2), el botón " +
                        "Cuenta (3) y el robot (4): verde si tu agente responde, rojo si está apagado.",
                    imagen: "ficha.webp",
                    alt: "La ficha de la cuenta con su nombre, la licencia, los créditos y el estado del agente",
                },
                {
                    titulo: "Las pestañas",
                    texto:
                        "1 Conexión · 2 Integraciones · 3 Preferencias · 4 Comportamiento · 5 Herramientas · 6 Cuenta · " +
                        "7 Seguridad · 8 Apariencia. Cada una tiene su apartado en esta guía.",
                    imagen: "pestanas.webp",
                    alt: "Las ocho pestañas de la pantalla numeradas",
                },
            ],
            consejos: [
                "En un teléfono las pestañas enseñan solo su icono; el nombre de la abierta sale debajo.",
                "Si eres asesor de una cuenta, ves la pantalla en solo lectura: los cambios los hace quien la administra.",
            ],
        },
        {
            slug: "conexion",
            titulo: "Conexión: tus canales",
            resumen: "WhatsApp por QR, las llamadas, Cloud API, Telegram, Facebook e Instagram.",
            icono: "Link2",
            miniatura: "mini-conexion.webp",
            pasos: [
                {
                    titulo: "Tus canales",
                    texto:
                        "1 Mensajería WhatsApp (QR) · 2 Llamadas WhatsApp (QR) · 3 WhatsApp Cloud API · 4 Mensajería " +
                        "Telegram · 5 Mensajería Facebook · 6 Mensajería Instagram.",
                    imagen: "conexion.webp",
                    alt: "La pestaña Conexión con las tarjetas de cada canal",
                },
                {
                    titulo: "Tu línea de WhatsApp",
                    texto:
                        "La tarjeta enseña el número conectado (1). El botón verde (2) cierra la sesión del teléfono, y " +
                        "el del robot (3) apaga o enciende la IA de esa línea.",
                    imagen: "whatsapp-qr.webp",
                    alt: "La tarjeta de la línea de WhatsApp conectada",
                },
                {
                    titulo: "Conectar otro canal",
                    texto:
                        "Cloud API, Telegram, Facebook e Instagram se conectan pegando sus credenciales: pulsa su botón " +
                        "Conectar y llena el formulario que se abre.",
                    imagen: "otro-canal.webp",
                    alt: "La tarjeta de WhatsApp Cloud API con su botón para conectar",
                },
                {
                    titulo: "Las llamadas de WhatsApp",
                    texto:
                        "Llamadas WhatsApp (QR) vincula el número con el que llamas a tus clientes desde la plataforma, " +
                        "y con el que llama el asistente de voz con IA.",
                    imagen: "llamadas.webp",
                    alt: "La tarjeta de Llamadas WhatsApp vinculada",
                },
            ],
            consejos: [
                "Un número solo puede estar conectado de una forma a la vez: por QR o por Cloud API.",
                "Si la línea se desconecta, vuelve aquí y escanea el QR otra vez: el historial no se pierde.",
            ],
        },
        {
            slug: "integraciones",
            titulo: "Integraciones: tu IA y tus avisos",
            resumen: "La clave de tu proveedor de IA y los números que reciben los avisos.",
            icono: "Zap",
            miniatura: "mini-integraciones.webp",
            pasos: [
                {
                    titulo: "Las dos tarjetas",
                    texto:
                        "Integraciones tiene dos tarjetas: Proveedor de IA (1), con la clave de tu modelo, y Contactos " +
                        "de notificación (2), los números que reciben las alertas.",
                    imagen: "integraciones.webp",
                    alt: "La pestaña Integraciones con sus dos tarjetas",
                },
                {
                    titulo: "Tu clave de IA",
                    texto:
                        "Con Configurar eliges el proveedor y el modelo y pegas tu clave. Por seguridad la plataforma " +
                        "solo enseña sus cuatro últimos caracteres.",
                    imagen: "ia-clave.webp",
                    alt: "El formulario de la clave de IA abierto",
                },
                {
                    titulo: "Tus contactos de notificación",
                    texto:
                        "El número principal (1) y hasta cuatro más (2), cada uno con su nombre. Ahí te llegan por " +
                        "WhatsApp los avisos de la cuenta. Agregar suma otro (3).",
                    imagen: "contactos.webp",
                    alt: "La tarjeta de contactos de notificación con sus números",
                },
            ],
            consejos: [
                "Con tu propia clave de IA, el consumo lo pagas directamente a tu proveedor.",
                "Pon en los contactos de notificación a quien tenga que enterarse cuando un cliente pide un asesor.",
            ],
        },
        {
            slug: "preferencias",
            titulo: "Preferencias: zona, empresa y mapa",
            resumen: "La zona horaria, el nombre de tu empresa y tu enlace de Google Maps.",
            icono: "Settings",
            miniatura: "mini-preferencias.webp",
            pasos: [
                {
                    titulo: "La zona horaria",
                    texto:
                        "En Zona horaria eliges la región de tu negocio: con ella se muestran las fechas y salen a su hora las citas, " +
                        "los recordatorios y los seguimientos.",
                    imagen: "zona-horaria.webp",
                    alt: "La tarjeta Zona horaria",
                },
                {
                    titulo: "Tu empresa",
                    texto: "En Empresa va el nombre de tu negocio, como se ve en la plataforma. Escríbelo y pulsa Guardar.",
                    imagen: "empresa.webp",
                    alt: "La tarjeta Empresa con el nombre del negocio",
                },
                {
                    titulo: "Tu ubicación en Google Maps",
                    texto:
                        "En URL de Google Maps enciende el interruptor (1) y pega el enlace de tu negocio (2): tu agente lo " +
                        "comparte cuando un cliente pregunta dónde estás.",
                    imagen: "maps.webp",
                    alt: "La tarjeta URL de Google Maps encendida, con su enlace",
                },
            ],
            consejos: ["Si apagas el interruptor de Google Maps, tu agente deja de compartir la ubicación."],
        },
        {
            slug: "comportamiento",
            titulo: "Comportamiento: cómo responde tu agente",
            resumen: "Encenderlo, el paso a un asesor, la encuesta, los tiempos y las frases.",
            icono: "Bot",
            miniatura: "mini-comportamiento.webp",
            pasos: [
                {
                    titulo: "El estado del agente",
                    texto:
                        "El interruptor de Estado del agente enciende o apaga la IA de toda la cuenta. Apagada, tus " +
                        "clientes solo reciben respuestas de tu equipo.",
                    imagen: "estado-del-agente.webp",
                    alt: "La tarjeta Estado del agente con su interruptor",
                },
                {
                    titulo: "El paso a un asesor",
                    texto:
                        "En Escalado a un asesor: 1 Permitir que la IA escale sola · 2 Apagar la IA al escalar · 3 Soltar si nadie responde. " +
                        "Así decides cuándo una persona toma la conversación.",
                    imagen: "escalado.webp",
                    alt: "Los tres interruptores del escalado a un asesor",
                },
                {
                    titulo: "Encuesta y sentimiento",
                    texto:
                        "Encuesta de satisfacción (1) le pregunta al cliente del 1 al 10 al resolver su chat. El " +
                        "Análisis de sentimiento (2) marca a los clientes molestos.",
                    imagen: "encuesta.webp",
                    alt: "Las tarjetas de encuesta de satisfacción y análisis de sentimiento",
                },
                {
                    titulo: "Los tiempos",
                    texto:
                        "En Tiempos de respuesta, Reactivación automática (1) son los minutos sin mensajes antes de que la IA vuelva a responder. " +
                        "Retraso de respuesta IA (2), lo que espera antes de contestar.",
                    imagen: "tiempos.webp",
                    alt: "Las tarjetas de tiempos de respuesta",
                },
                {
                    titulo: "Las frases",
                    texto:
                        "En Frases automáticas, Frase de reactivación (1) es el mensaje al reactivar una conversación, y Frase de desactivación " +
                        "(2), la que escribe el cliente para no recibir más seguimientos.",
                    imagen: "frases.webp",
                    alt: "Las tarjetas de frases automáticas",
                },
                {
                    titulo: "Las funciones avanzadas",
                    texto:
                        "En Funciones avanzadas, Puente con operario (1) pasa mensajes a tus técnicos de campo, y Modo Dueño por WhatsApp (2) te deja " +
                        "manejar el agente escribiéndole por WhatsApp.",
                    imagen: "avanzadas.webp",
                    alt: "Las tarjetas de funciones avanzadas",
                },
            ],
            consejos: [
                "Los cambios de cada tarjeta se guardan solos o con su propio botón.",
                "Si una persona escribe desde la plataforma o desde el teléfono, la IA de ese chat se pausa sola.",
            ],
        },
        {
            slug: "herramientas",
            titulo: "Herramientas: lo que puede hacer tu agente",
            resumen: "Encender las acciones de tu agente: avisar, agendar, buscar productos y más.",
            icono: "SlidersHorizontal",
            miniatura: "mini-herramientas.webp",
            pasos: [
                {
                    titulo: "Tus herramientas",
                    texto:
                        "Cada tarjeta es algo que tu agente sabe hacer: avisar a un asesor, ejecutar flujos, buscar un " +
                        "producto, agendar una cita… Arriba, cuántas tienes activas.",
                    imagen: "herramientas.webp",
                    alt: "La pestaña Herramientas con la lista de herramientas",
                },
                {
                    titulo: "Encender o apagar",
                    texto:
                        "El interruptor de cada una la enciende o la apaga. Las marcadas como esencial son las que tu " +
                        "agente necesita para trabajar bien.",
                    imagen: "herramienta-interruptor.webp",
                    alt: "Una herramienta con su etiqueta de esencial y su interruptor",
                },
                {
                    titulo: "Ajustarla",
                    texto:
                        "El lápiz abre su descripción: es lo que lee la IA para saber cuándo usarla. La flecha circular " +
                        "de arriba vuelve a cargar la lista.",
                    imagen: "herramienta-editar.webp",
                    alt: "El lápiz de una herramienta y el botón de recargar la lista",
                },
            ],
            consejos: ["Enciende solo las que uses: un agente con menos herramientas decide más rápido y mejor."],
        },
        {
            slug: "cuenta",
            titulo: "Cuenta: tu plan, tus créditos y tu sesión",
            resumen: "El plan y su pago, los créditos de IA y cerrar la sesión en todos lados.",
            icono: "Wallet",
            miniatura: "mini-cuenta.webp",
            pasos: [
                {
                    titulo: "Tu plan",
                    texto:
                        "Plan actual dice tu nivel y su estado (1), el monto al mes y el medio de pago (2), y la fecha " +
                        "de vencimiento (3).",
                    imagen: "plan.webp",
                    alt: "La tarjeta Plan actual",
                },
                {
                    titulo: "Tus créditos de IA",
                    texto:
                        "Créditos IA enseña los totales, los consumidos y los disponibles (1), con su barra, y cuándo " +
                        "se renuevan (2).",
                    imagen: "creditos.webp",
                    alt: "La tarjeta Créditos IA con su barra de consumo",
                },
                {
                    titulo: "Cambiar de plan o comprar créditos",
                    texto:
                        "El botón redondo de abajo a la derecha abre 1 Cambiar plan · 2 Comprar créditos · 3 Cancelar " +
                        "plan.",
                    imagen: "plan-acciones.webp",
                    alt: "El botón redondo abierto con sus tres opciones",
                },
                {
                    titulo: "Tu sesión",
                    texto:
                        "Sesión activa dice con qué cuenta entraste. Cerrar sesión en todos los dispositivos saca a " +
                        "cualquier otro equipo donde la hayas abierto.",
                    imagen: "sesiones.webp",
                    alt: "Las tarjetas Sesión activa y Cerrar sesión",
                },
            ],
            consejos: ["Cerrar sesión en todos los dispositivos también te saca a ti: vuelves a entrar con tu correo y tu contraseña."],
        },
        {
            slug: "seguridad",
            titulo: "Seguridad: tu correo y tu contraseña",
            resumen: "Cambiar el correo con el que entras y tu contraseña.",
            icono: "ShieldCheck",
            miniatura: "mini-seguridad.webp",
            pasos: [
                {
                    titulo: "Las dos tarjetas",
                    texto: "Seguridad tiene dos tarjetas: Cambio de correo (1) y la de tu contraseña (2).",
                    imagen: "seguridad.webp",
                    alt: "La pestaña Seguridad con sus dos tarjetas",
                },
                {
                    titulo: "Cambiar el correo",
                    texto:
                        "Escribe tu correo en Nuevo correo (1) y repítelo en Confirmar correo (2). Desde entonces entras con el " +
                        "correo nuevo.",
                    imagen: "correo.webp",
                    alt: "La tarjeta Cambio de correo con sus dos campos",
                },
                {
                    titulo: "Cambiar la contraseña",
                    texto:
                        "Pon tu Contraseña actual (1), la Nueva contraseña (2) y repítela en Confirmar contraseña (3). El ojo de " +
                        "cada campo enseña lo que escribes.",
                    imagen: "contrasena.webp",
                    alt: "La tarjeta de la contraseña con sus tres campos",
                },
            ],
            consejos: ["Usa una contraseña que no uses en otro sitio, con letras y números."],
        },
        {
            slug: "apariencia",
            titulo: "Apariencia: tu logo y el aspecto del panel",
            resumen: "Tu logo, la marca visual, el tamaño de la letra y el modo claro u oscuro.",
            icono: "Palette",
            miniatura: "mini-apariencia.webp",
            pasos: [
                {
                    titulo: "Tu logo",
                    texto:
                        "Subir logo pone la imagen de tu negocio arriba de la barra lateral. Mejor cuadrada, de " +
                        "256×256 píxeles, en PNG, JPG o WEBP.",
                    imagen: "logo.webp",
                    alt: "La tarjeta Tu logo con su botón",
                },
                {
                    titulo: "El tema del panel",
                    texto: "En Tema del panel, Marca visual elige los colores del panel. Cada opción enseña su color al lado del nombre.",
                    imagen: "tema.webp",
                    alt: "El selector de marca visual abierto",
                },
                {
                    titulo: "El tamaño de la letra",
                    texto:
                        "En Tamaño de letra, Normal, Grande o Más grande agranda el texto de toda la plataforma en este dispositivo, sin " +
                        "tocar los demás.",
                    imagen: "letra.webp",
                    alt: "La tarjeta Tamaño de letra con sus tres opciones",
                },
                {
                    titulo: "Claro u oscuro",
                    texto:
                        "Modo de color: Claro, Oscuro o Sistema, que sigue lo que tenga puesto tu equipo o tu teléfono.",
                    imagen: "modo-de-color.webp",
                    alt: "La tarjeta Modo de color con sus tres opciones",
                },
            ],
            consejos: [
                "El tamaño de letra y el modo de color se guardan en cada dispositivo: puedes tener uno en el computador y otro en el teléfono.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("conexion", GUIA_CONEXION);

export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
