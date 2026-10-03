/**
 * La GUÍA PÚBLICA de Reportes (`/guia/reportes`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Reportes (`/crm/reportes`) es una vista del CRM: los reportes de cada semana
 * con «Lo que la IA no supo responder» debajo, y al lado las pestañas
 * Registros y Calidad, que la guía también explica. Las listas de abajo no son
 * decoración: el banco las compara con lo que pintan `WeeklyReportsView.tsx`,
 * `LoQueLaIaNoSupoView.tsx`, `CalidadView.tsx`, la sección de registros y
 * `CrmDashboard.tsx`. Un botón o una columna nueva sin su nombre aquí pone el
 * banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Reportes en el menú de un cliente («Resumen», dentro de Panel). */
export const MODULO_DE_REPORTES = "Panel";

/** Las ZONAS de la pantalla, en el orden en que se leen. */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Las pestañas del Panel",
    "Las pestañas del CRM",
    "La barra de los reportes",
    "Los reportes de cada semana",
    "Lo que la IA no supo responder",
] as const;

/** Las pestañas del CRM, en su orden (`data-pestana` de `CrmDashboard.tsx`). */
export const PESTANAS_DEL_CRM = [
    { nombre: "Analíticas", pestana: "analiticas" },
    { nombre: "Registros", pestana: "registros" },
    { nombre: "Llamadas", pestana: "llamadas" },
    { nombre: "Kanban", pestana: "kanban" },
    { nombre: "Reportes", pestana: "reportes" },
    { nombre: "Calidad", pestana: "calidad" },
] as const;

/** Los botones de la barra de los reportes, en su orden (`data-boton` de `WeeklyReportsView.tsx`). */
export const BOTONES_DE_LA_BARRA = [
    { nombre: "Exportar", boton: "exportar" },
    { nombre: "Eliminar todos", boton: "eliminar-todos" },
    { nombre: "Actualizar", boton: "actualizar" },
    { nombre: "Generar reporte", boton: "generar" },
] as const;

/** Los bloques de un reporte abierto, en su orden, con el título que pintan. */
export const BLOQUES_DE_UN_REPORTE = [
    "Resumen generado por IA",
    "Métricas de la semana",
    "Distribución de puntuación",
    "Calidad de atención",
    "Actividad de la semana",
] as const;

/** Las cuatro cifras de «Métricas de la semana». */
export const METRICAS_DE_LA_SEMANA = ["Total leads", "Calientes", "Finalizados", "Score prom."] as const;

/** Las columnas del Excel de «Exportar», en su orden. */
export const COLUMNAS_DEL_EXCEL = [
    "Período",
    "Total leads",
    "Nuevos leads",
    "Conversiones",
    "Puntuación promedio",
    "Calidad de atención",
    "Enviado por WhatsApp",
    "Generado",
] as const;

/** Los periodos de «Lo que la IA no supo responder». */
export const PERIODOS_SIN_RESPUESTA = ["7 días", "30 días", "90 días", "Todo"] as const;

/** Las pestañas de Registros, en su orden (`CRM_TABS` y `getTipoLabel`). */
export const TIPOS_DE_REGISTRO = [
    "Todos",
    "Reportes",
    "Solicitudes",
    "Pedidos",
    "Reclamos",
    "Pagos",
    "Reservas",
    "Productos",
] as const;

/** Las columnas de la tabla de registros (`CRM_TABLE_COLUMN_LABELS`). */
export const COLUMNAS_DE_REGISTROS = [
    "WhatsApp",
    "Nombre",
    "Tipo",
    "Fecha",
    "Detalle",
    "Lead",
    "Follow-up",
    "Estado",
    "Acciones",
] as const;

/** El menú «Acciones del registro» (`CrmRecordActionsCell.tsx`). */
export const ACCIONES_DE_UN_REGISTRO = [
    "Llamar",
    "Editar registro",
    "Eliminar registro",
    "Eliminar movimientos del lead",
] as const;

/** Los periodos de Calidad. */
export const PERIODOS_DE_CALIDAD = ["Últimos 7 días", "Últimos 30 días", "Últimos 90 días"] as const;

/** Las columnas de la tabla «Por asesor» de Calidad. */
export const COLUMNAS_POR_ASESOR = ["Asesor", "Conversaciones", "Puntaje", "1.ª respuesta", "Resolución", "A mejorar"] as const;

/** Las columnas de la tabla de conversaciones de Calidad. */
export const COLUMNAS_DE_CONVERSACIONES = [
    "Contacto",
    "Asesor",
    "Puntaje",
    "1.ª respuesta",
    "Resolución",
    "Resolvió",
    "Qué mejorar",
    "Acciones",
] as const;

const enLinea = (lista: readonly string[]) => lista.map((x, i) => `${i + 1} ${x}`).join(" · ");

export const GUIA_REPORTES: Contenido = {
    titulo: "Reportes",
    subtitulo: "Cómo le fue a tu negocio cada semana, contado por la IA",
    descripcion:
        "Reportes junta en una pantalla lo que pasó cada semana: cuántos leads entraron, cuántos cerraron y un resumen " +
        "escrito por la IA, que además te llega por WhatsApp. Debajo ves las preguntas que tu agente no supo responder, " +
        "para que las añadas a su entrenamiento. Y al lado, en las pestañas del CRM, están los registros que la IA va " +
        "anotando y la calidad de la atención de cada asesor.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, las pestañas, los reportes y lo que la IA no supo.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto: enLinea(ZONAS_DE_LA_PANTALLA) + ".",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Reportes con sus siete partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Reportes está dentro de Panel, con el nombre Resumen. Al " +
                        "entrar a una pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Resumen dentro de Panel",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "Las pestañas del Panel",
                    texto:
                        "Reportes es una pestaña del Panel, junto a Catálogo, Cobros, Proyectos y las demás: pasas de " +
                        "una a otra sin volver al menú.",
                    imagen: "pestanas.webp",
                    alt: "Las pestañas del Panel con Resumen señalada",
                },
                {
                    titulo: "Las pestañas del CRM",
                    texto:
                        enLinea(PESTANAS_DEL_CRM.map((p) => p.nombre)) +
                        ". Reportes es la que abre esta pantalla; Registros y Calidad se explican más abajo en esta guía.",
                    imagen: "pestanas-del-crm.webp",
                    alt: "Las seis pestañas del CRM con Reportes marcada",
                },
            ],
            consejos: ["Esta pantalla solo lee: mirar un reporte no cambia nada de tus leads."],
        },
        {
            slug: "generar",
            titulo: "Generar un reporte",
            resumen: "La IA resume la última semana cuando tú lo pides.",
            icono: "Sparkles",
            miniatura: "mini-generar.webp",
            pasos: [
                {
                    titulo: "La barra de los reportes",
                    texto: enLinea(BOTONES_DE_LA_BARRA.map((b) => b.nombre)) + ".",
                    imagen: "barra.webp",
                    alt: "La barra de los reportes con sus botones numerados",
                },
                {
                    titulo: "Pulsa «Generar reporte»",
                    texto:
                        "La IA revisa los últimos siete días de tu cuenta —leads, seguimientos, registros y calidad— y " +
                        "escribe el reporte. Tarda unos segundos.",
                    imagen: "generar.webp",
                    alt: "El botón Generar reporte resaltado",
                },
                {
                    titulo: "Sale arriba de la lista",
                    texto:
                        "El reporte nuevo aparece el primero. La lista guarda los últimos reportes, del más nuevo al más " +
                        "viejo; «Actualizar» vuelve a leerla.",
                    imagen: "generado.webp",
                    alt: "El reporte recién generado arriba de la lista",
                },
            ],
            consejos: [
                "No hace falta generarlo a mano: cada semana se genera solo.",
                "Generar un reporte gasta créditos de IA de tu cuenta.",
            ],
        },
        {
            slug: "leer",
            titulo: "Leer un reporte",
            resumen: "La cabecera con lo esencial, y al abrirlo el resumen y las cifras.",
            icono: "FileText",
            miniatura: "mini-leer.webp",
            pasos: [
                {
                    titulo: "La cabecera",
                    texto:
                        "La semana que cubre, cuándo se generó, cuántos leads entraron y cuántos se finalizaron. Si ya " +
                        "salió por WhatsApp, lleva la marca «Enviado».",
                    imagen: "cabecera.webp",
                    alt: "La cabecera de un reporte con sus partes señaladas",
                },
                {
                    titulo: "Ábrelo",
                    texto: "Pulsa la cabecera para desplegarlo: " + enLinea(BLOQUES_DE_UN_REPORTE) + ".",
                    imagen: "abierto.webp",
                    alt: "Un reporte abierto con sus bloques numerados",
                },
                {
                    titulo: "Las métricas de la semana",
                    texto:
                        enLinea(METRICAS_DE_LA_SEMANA) +
                        ". Debajo de cada cifra va su detalle: nuevos, tibios, follow-ups enviados y leads sin puntuar.",
                    imagen: "metricas.webp",
                    alt: "Las cuatro métricas de la semana",
                },
                {
                    titulo: "Calidad y actividad",
                    texto:
                        "La calidad de atención resume el puntaje de la semana y quién atendió mejor. La actividad cuenta " +
                        "los pagos, pedidos, reservas y demás registros que la IA anotó.",
                    imagen: "calidad-y-actividad.webp",
                    alt: "Los bloques Calidad de atención y Actividad de la semana",
                },
            ],
            consejos: ["Pulsa otra vez la cabecera para plegarlo."],
        },
        {
            slug: "whatsapp",
            titulo: "Recibirlo por WhatsApp",
            resumen: "El reporte te llega solo, cada semana, a tu número de notificaciones.",
            icono: "Send",
            miniatura: "mini-whatsapp.webp",
            pasos: [
                {
                    titulo: "La marca «Enviado»",
                    texto:
                        "Cada reporte que salió por WhatsApp lleva su marca verde. Pasa el ratón por encima para ver el día " +
                        "y la hora en que salió.",
                    imagen: "enviado.webp",
                    alt: "La marca Enviado de un reporte",
                },
                {
                    titulo: "Al generarlo, sale",
                    texto:
                        "Cuando pulsas «Generar reporte», además de guardarse se envía por WhatsApp. El aviso de abajo te " +
                        "dice si salió.",
                    imagen: "aviso-enviado.webp",
                    alt: "El aviso Reporte generado y enviado por WhatsApp",
                },
                {
                    titulo: "Cada semana, sin hacer nada",
                    texto:
                        "La plataforma genera y envía el reporte de la semana por su cuenta, al número de notificaciones " +
                        "de tu perfil. Ese número se cambia en Conexión y Ajustes.",
                    imagen: "lista-enviados.webp",
                    alt: "La lista de reportes, todos con la marca Enviado",
                },
            ],
            consejos: [
                "Si un reporte no tiene la marca, no salió: revisa que tu línea de WhatsApp esté conectada.",
                "El mensaje trae lo mismo que la pantalla, en corto.",
            ],
        },
        {
            slug: "exportar",
            titulo: "Exportar los reportes",
            resumen: "Bájate todos los reportes en una hoja de Excel.",
            icono: "Download",
            miniatura: "mini-exportar.webp",
            pasos: [
                {
                    titulo: "Pulsa «Exportar»",
                    texto: "Está en la barra, a la izquierda. Baja un archivo de Excel con un reporte por fila.",
                    imagen: "exportar.webp",
                    alt: "El botón Exportar resaltado",
                },
                {
                    titulo: "Qué trae cada fila",
                    texto: enLinea(COLUMNAS_DEL_EXCEL) + ".",
                    imagen: "exportar-barra.webp",
                    alt: "La barra de los reportes con Exportar resaltado",
                },
                {
                    titulo: "Lo que se exporta es lo que ves",
                    texto:
                        "Se bajan los reportes de la lista. Si miras varias cuentas a la vez, salen los de todas las que " +
                        "tengas elegidas.",
                    imagen: "exportar-lista.webp",
                    alt: "La lista de reportes que se exporta",
                },
            ],
            consejos: ["El archivo se llama reportes-semanales con la fecha del día."],
        },
        {
            slug: "borrar",
            titulo: "Borrar reportes",
            resumen: "Uno con su papelera, o todos a la vez. Siempre pregunta antes.",
            icono: "Trash2",
            miniatura: "mini-borrar.webp",
            pasos: [
                {
                    titulo: "La papelera de un reporte",
                    texto: "En la cabecera de cada reporte, a la derecha, está su papelera.",
                    imagen: "papelera.webp",
                    alt: "La papelera de un reporte resaltada",
                },
                {
                    titulo: "Confirma",
                    texto:
                        "Sale «¿Eliminar este reporte?» con la semana que vas a borrar. «Volver» lo deja como estaba; " +
                        "«Eliminar» lo borra.",
                    imagen: "borrar-confirmar.webp",
                    alt: "La ventana ¿Eliminar este reporte?",
                },
                {
                    titulo: "Eliminar todos",
                    texto:
                        "El botón rojo de la barra borra todos los reportes de tu cuenta. También pregunta antes, y dice " +
                        "cuántos se van.",
                    imagen: "eliminar-todos.webp",
                    alt: "La ventana ¿Eliminar todos los reportes?",
                },
            ],
            consejos: [
                "Borrar un reporte no borra tus leads ni sus datos: solo el resumen.",
                "No se puede deshacer, pero puedes generar otro cuando quieras.",
            ],
        },
        {
            slug: "ia-no-supo",
            titulo: "Lo que la IA no supo responder",
            resumen: "Las preguntas que tu agente no supo contestar, para enseñárselas.",
            icono: "Bot",
            miniatura: "mini-ia-no-supo.webp",
            pasos: [
                {
                    titulo: "Debajo de los reportes",
                    texto:
                        "Una lista de las preguntas que tu agente no supo responder, ordenada por cuántas veces salieron. " +
                        "Arriba dice cuántas son en total.",
                    imagen: "sin-respuesta.webp",
                    alt: "La lista Lo que la IA no supo responder",
                },
                {
                    titulo: "Elige el periodo",
                    texto: enLinea(PERIODOS_SIN_RESPUESTA) + ". El botón de las flechas vuelve a cargar la lista.",
                    imagen: "sin-respuesta-periodos.webp",
                    alt: "Los botones de periodo de la lista",
                },
                {
                    titulo: "Cada pregunta",
                    texto:
                        "El número amarillo es cuántas veces se preguntó. Debajo, cuándo fue la última, cuántas veces pasó " +
                        "a un asesor y cuántas se le dijo al cliente que no se sabía.",
                    imagen: "sin-respuesta-pregunta.webp",
                    alt: "Una pregunta con su número de veces y su detalle",
                },
                {
                    titulo: "Las variantes",
                    texto:
                        "Las otras formas en que se preguntó lo mismo van plegadas. Púlsalas para verlas: así sabes que la " +
                        "IA las juntó bien.",
                    imagen: "sin-respuesta-variantes.webp",
                    alt: "Una pregunta con sus variantes abiertas",
                },
            ],
            consejos: [
                "Añade cada respuesta al entrenamiento de tu agente IA y dejará de salir aquí.",
                "Las que pasaron a un asesor son las que más te cuestan: empieza por ellas.",
            ],
        },
        {
            slug: "registros",
            titulo: "Los registros, por tipo",
            resumen: "Lo que la IA va anotando de tus clientes: pedidos, pagos, reclamos y más.",
            icono: "ClipboardList",
            miniatura: "mini-registros.webp",
            pasos: [
                {
                    titulo: "La pestaña Registros",
                    texto:
                        "Cada vez que un cliente pide algo concreto, paga o se queja, la IA lo anota como un registro. Aquí " +
                        "los ves todos.",
                    imagen: "registros.webp",
                    alt: "La pestaña Registros abierta",
                },
                {
                    titulo: "Filtra por tipo",
                    texto:
                        enLinea(TIPOS_DE_REGISTRO) + ". Cada pestaña lleva cuántos hay; pulsa una para ver solo esos.",
                    imagen: "registros-tipos.webp",
                    alt: "Las pestañas de tipo de registro numeradas",
                },
                {
                    titulo: "La tabla y el buscador",
                    texto:
                        enLinea(COLUMNAS_DE_REGISTROS) +
                        ". El buscador encuentra por nombre, número o lo que diga el detalle.",
                    imagen: "registros-tabla.webp",
                    alt: "La tabla de registros con el buscador",
                },
                {
                    titulo: "Las acciones de un registro",
                    texto: "Los tres puntos de cada fila: " + enLinea(ACCIONES_DE_UN_REGISTRO) + ".",
                    imagen: "registros-acciones.webp",
                    alt: "El menú Acciones del registro abierto",
                },
            ],
            consejos: ["Eliminar un registro pide confirmación y no se puede deshacer."],
        },
        {
            slug: "calidad-por-asesor",
            titulo: "Calidad: el puntaje de cada asesor",
            resumen: "La IA puntúa cada conversación y lo reparte por asesor.",
            icono: "ShieldCheck",
            miniatura: "mini-calidad-por-asesor.webp",
            pasos: [
                {
                    titulo: "La pestaña Calidad",
                    texto:
                        "La IA revisa las conversaciones de la semana y les pone un puntaje de 0 a 100: si se saludó bien, " +
                        "el tono, si se resolvió y lo que tardó la respuesta.",
                    imagen: "calidad.webp",
                    alt: "La pestaña Calidad abierta",
                },
                {
                    titulo: "Su barra",
                    texto:
                        "El buscador, Todas y A mejorar, el periodo (" +
                        PERIODOS_DE_CALIDAD.join(", ") +
                        "), Exportar, Actualizar y «Evaluar ahora», que revisa las conversaciones sin esperar a la semana.",
                    imagen: "calidad-barra.webp",
                    alt: "La barra de Calidad con sus partes señaladas",
                },
                {
                    titulo: "Por asesor",
                    texto:
                        enLinea(COLUMNAS_POR_ASESOR) +
                        ". «A mejorar» cuenta las conversaciones por debajo de 60.",
                    imagen: "calidad-por-asesor.webp",
                    alt: "La tabla Por asesor de Calidad",
                },
                {
                    titulo: "Solo las de un asesor",
                    texto:
                        "Pulsa la fila de un asesor y la lista de abajo enseña solo sus conversaciones. La pastilla con su " +
                        "nombre y la X quita el filtro.",
                    imagen: "calidad-un-asesor.webp",
                    alt: "La lista filtrada por un asesor",
                },
            ],
            consejos: [
                "«Agente IA» es una fila más: así ves cómo atiende tu IA comparada con tu equipo.",
                "Evaluar gasta créditos de IA de tu cuenta.",
            ],
        },
        {
            slug: "calidad-por-conversacion",
            titulo: "Calidad: conversación por conversación",
            resumen: "El puntaje de cada conversación y qué se podía hacer mejor.",
            icono: "MessageSquare",
            miniatura: "mini-calidad-por-conversacion.webp",
            pasos: [
                {
                    titulo: "La lista de conversaciones",
                    texto: enLinea(COLUMNAS_DE_CONVERSACIONES) + ".",
                    imagen: "calidad-conversaciones.webp",
                    alt: "La tabla de conversaciones de Calidad",
                },
                {
                    titulo: "Solo las que hay que mejorar",
                    texto:
                        "La pastilla «A mejorar» deja solo las de puntaje bajo, con lo que la IA sugiere cambiar en cada una.",
                    imagen: "calidad-a-mejorar.webp",
                    alt: "La lista filtrada por A mejorar",
                },
                {
                    titulo: "Abrir o exportar una conversación",
                    texto:
                        "El globo abre la conversación en Chats; la flecha la baja en PDF o en texto, para revisarla con tu " +
                        "equipo.",
                    imagen: "calidad-acciones.webp",
                    alt: "Los botones de abrir y exportar una conversación",
                },
            ],
            consejos: [
                "Los grupos de WhatsApp no se puntúan: no son clientes.",
                "Las conversaciones se vuelven a evaluar si entran mensajes nuevos.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("reportes", GUIA_REPORTES);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
