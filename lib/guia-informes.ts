/**
 * El CONTENIDO de la guía pública de Informes (`/guia/informes`): la pantalla
 * `/crm/dashboard`, la vista «Analíticas» del CRM, con sus trece secciones
 * plegables, el selector de periodo y el de las cuentas de la familia.
 *
 * Mismo estándar que Leads y Finanzas, y con las MISMAS piezas: la forma de una
 * sección, la barra de arriba y la carpeta salen de `lib/guia-de-modulo.ts`.
 * Las capturas y el vídeo los genera `scripts/capturar-guia-informes.mjs` sobre
 * la App servida de verdad, y el banco (`lib/__tests__/guia-informes.test.mjs`)
 * compara lo que esta guía dice con lo que pinta la pantalla: las secciones y
 * sus tarjetas salen de `lib/secciones-de-informes.ts`, que es lo mismo que lee
 * la pantalla, y las vistas, los periodos y los mandos de la barra se leen del
 * código. El día que la pantalla gane una sección, el banco se pone en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";
import { PERIODOS_DE_INFORMES, SECCIONES_DE_INFORMES } from "@/lib/secciones-de-informes";

/** La ruta de la pantalla que documenta esta guía. */
export const RUTA_DE_INFORMES = "/crm/dashboard";

/** Dónde vive Informes en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_INFORMES = "Panel";

/** Cómo se llama Informes dentro de su módulo del menú. */
export const NOMBRE_EN_EL_MENU = "Estadísticas";

/**
 * Las siete ZONAS de la pantalla de partida, en el orden en que se leen, tal
 * como las numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Las pestañas del Panel",
    "Las vistas del CRM",
    "El periodo y las cuentas",
    "La barra: buscar, filtrar, secciones y exportar",
    "Las secciones plegables",
] as const;

/** Las vistas de la fila de arriba, en su orden (`CrmDashboard.tsx`). */
export const VISTAS_DEL_CRM = ["Analíticas", "Registros", "Llamadas", "Kanban", "Reportes", "Calidad"] as const;

/** Los mandos de la barra de Analíticas, en su orden (`AnalyticsView.tsx`). */
export const MANDOS_DE_LA_BARRA = ["Buscar en analíticas", "Filtros", "Secciones", "Exportar CSV"] as const;

/** Las temperaturas que ofrece el filtro de estado del lead. */
export const ESTADOS_DEL_FILTRO = ["Todos", "Frío", "Tibio", "Caliente", "Finalizado", "Descartado"] as const;

/** Las opciones del selector de cuentas de la familia. */
export const OPCIONES_DE_CUENTAS = ["Todas las cuentas", "Solo mi cuenta"] as const;

const titulos = (claves: readonly string[]) =>
    claves.map((c) => SECCIONES_DE_INFORMES.find((s) => s.clave === c)!.titulo).join(", ");

export const GUIA_INFORMES: Contenido = {
    titulo: "Informes",
    subtitulo: "Todo lo que pasa en tu negocio, en una pantalla",
    descripcion:
        "Informes reúne los números de tu negocio: cuántos leads llegaron, cómo trabaja tu agente IA, tus citas, " +
        "llamadas, encuestas, ventas, gastos, productos y créditos. Eliges el periodo que quieres mirar y, si tienes " +
        "varias cuentas, las juntas o miras una sola. Cada sección se pliega para dejar a la vista solo lo que te " +
        "interesa.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, las pestañas del Panel, las vistas, el periodo y las secciones.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba · 3 Las pestañas del Panel · " +
                        "4 Las vistas del CRM · 5 El periodo y las cuentas · " +
                        "6 La barra: buscar, filtrar, secciones y exportar · 7 Las secciones plegables.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Informes con sus siete partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Informes está dentro de Panel, con el nombre " +
                        "Estadísticas. Al entrar a una pantalla el menú se recoge en sus iconos; las dos flechas de " +
                        "arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Estadísticas dentro de Panel",
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
                        "Informes es una pestaña del Panel, junto a Finanzas, Catálogo, Cobros y las demás: pasas de " +
                        "una a otra sin volver al menú.",
                    imagen: "pestanas.webp",
                    alt: "Las pestañas del Panel con Estadísticas señalada",
                },
                {
                    titulo: "Las vistas del CRM",
                    texto:
                        "La fila de arriba cambia de vista: Analíticas, Registros, Llamadas, Kanban, Reportes y " +
                        "Calidad. Esta guía es la de Analíticas, que es con la que abre la pantalla.",
                    imagen: "vistas.webp",
                    alt: "La fila de vistas del CRM con Analíticas marcada",
                },
            ],
        },
        {
            slug: "periodo-y-cuentas",
            titulo: "El periodo y las cuentas",
            resumen: "Elige cuántos días mirar y, si tienes varias cuentas, cuáles juntar.",
            icono: "CalendarRange",
            miniatura: "mini-periodo-y-cuentas.webp",
            pasos: [
                {
                    titulo: "El periodo",
                    texto:
                        "Los botones 7 días, 30 días, 90 días y Todo deciden qué tramo miran las gráficas. La " +
                        "pantalla abre en 30 días, y el botón marcado es el que se está mirando.",
                    imagen: "periodo.webp",
                    alt: "Los botones del periodo con 30 días marcado",
                },
                {
                    titulo: "Las cuentas de tu familia",
                    texto:
                        "Si tu cuenta tiene sucursales o cuentas que cuelgan de ella, aparece el botón Todas las " +
                        "cuentas. Al abrirlo ves cada una con una casilla: marcas las que quieres juntar.",
                    imagen: "cuentas.webp",
                    alt: "El menú Cuentas de la familia abierto, con cada cuenta y su casilla",
                },
                {
                    titulo: "Solo mi cuenta",
                    texto:
                        "Solo mi cuenta deja únicamente la tuya, y Todas las cuentas vuelve a juntarlas. Los números " +
                        "de todas las secciones se recalculan con lo que elijas.",
                    imagen: "cuentas-una.webp",
                    alt: "El selector con una sola cuenta elegida",
                },
            ],
            consejos: [
                "Solo ves las cuentas que cuelgan de la tuya, nunca la de arriba ni las de al lado.",
                "Los créditos IA y las etiquetas son siempre los de la cuenta con la que entraste.",
            ],
        },
        {
            slug: "barra",
            titulo: "Buscar, filtrar y plegar",
            resumen: "El buscador, los filtros, el menú de secciones, exportar y plegar cada sección.",
            icono: "SlidersHorizontal",
            miniatura: "mini-barra.webp",
            pasos: [
                {
                    titulo: "Buscar una sección",
                    texto:
                        "Escribe en Buscar en analíticas y quedan solo las secciones cuyo nombre, o el de alguna de " +
                        "sus gráficas, coincide. No importan las tildes ni las mayúsculas.",
                    imagen: "buscar.webp",
                    alt: "El buscador con «citas» escrito y solo la sección Citas a la vista",
                },
                {
                    titulo: "Filtros",
                    texto:
                        "El botón Filtros elige un estado del lead: Frío, Tibio, Caliente, Finalizado o " +
                        "Descartado. Afecta a las gráficas de leads y del embudo; Limpiar filtros lo quita.",
                    imagen: "filtros.webp",
                    alt: "La ventana de filtros con el estado del lead",
                },
                {
                    titulo: "Mostrar u ocultar secciones",
                    texto:
                        "El botón Secciones lista las trece secciones con su casilla: la que desmarcas deja de " +
                        "verse hasta que la vuelvas a marcar.",
                    imagen: "secciones-menu.webp",
                    alt: "El menú de secciones con sus casillas",
                },
                {
                    titulo: "Exportar",
                    texto:
                        "El botón de descarga baja las cifras de la pantalla en un archivo CSV, con el periodo en el " +
                        "nombre, para abrirlo en Excel o Google Sheets.",
                    imagen: "exportar.webp",
                    alt: "El botón de exportar a CSV señalado",
                },
                {
                    titulo: "Plegar una sección",
                    texto:
                        "Pulsa el título de una sección para plegarla y otra vez para desplegarla. La pantalla " +
                        "recuerda cuáles dejaste plegadas para la próxima vez.",
                    imagen: "plegar.webp",
                    alt: "Una sección plegada y la siguiente desplegada",
                },
            ],
            consejos: [`Las secciones son: ${SECCIONES_DE_INFORMES.map((s) => s.titulo).join(", ")}.`],
        },
        {
            slug: "actividad",
            titulo: "Actividad y agente IA",
            resumen: `${titulos(["actividad", "rendimiento"])}: lo que entra y cómo responde tu agente.`,
            icono: "TrendingUp",
            miniatura: "mini-actividad.webp",
            pasos: [
                {
                    titulo: "Nuevas sesiones por día",
                    texto:
                        "Cuántas conversaciones nuevas llegaron cada día del periodo. Un pico te dice qué día movió " +
                        "más tu publicidad.",
                    imagen: "actividad.webp",
                    alt: "La gráfica de nuevas sesiones por día",
                },
                {
                    titulo: "Registros por tipo",
                    texto:
                        "Lo que el agente anotó en el CRM, por tipo: reportes, solicitudes, pedidos, reclamos, " +
                        "pagos, reservas y productos.",
                    imagen: "registros.webp",
                    alt: "La gráfica de registros por tipo",
                },
                {
                    titulo: "Rendimiento del Agente IA",
                    texto:
                        "Las tasas de conversión de tus leads y la efectividad de los seguimientos automáticos: " +
                        "cuántos salieron, cuántos esperan y cuántos fallaron.",
                    imagen: "rendimiento.webp",
                    alt: "Las tasas de conversión y la efectividad de los follow-ups",
                },
            ],
        },
        {
            slug: "leads-y-citas",
            titulo: "Leads, seguimientos y citas",
            resumen: `${titulos(["leads", "citas"])}: la temperatura de tus contactos y tu agenda.`,
            icono: "Users",
            miniatura: "mini-leads-y-citas.webp",
            pasos: [
                {
                    titulo: "Leads por temperatura y embudo",
                    texto:
                        "Cuántos contactos están fríos, tibios, calientes, finalizados o descartados, y el embudo que " +
                        "enseña cuántos avanzan de una etapa a la siguiente.",
                    imagen: "leads.webp",
                    alt: "Los leads por temperatura y el embudo de conversión",
                },
                {
                    titulo: "Estado de seguimientos",
                    texto:
                        "Los follow-ups por estado y el resumen de leads: así sabes si a tus contactos se les está " +
                        "escribiendo a tiempo.",
                    imagen: "seguimientos.webp",
                    alt: "El estado de los seguimientos y el resumen de leads",
                },
                {
                    titulo: "Citas",
                    texto:
                        "Las citas del periodo, las próximas siete días y cómo se reparten por estado: pendientes, " +
                        "confirmadas, atendidas, canceladas o sin asistir.",
                    imagen: "citas.webp",
                    alt: "El resumen de citas y las citas por estado",
                },
            ],
        },
        {
            slug: "llamadas-y-satisfaccion",
            titulo: "Llamadas, NPS y sentimiento",
            resumen: `${titulos(["llamadas", "satisfaccion", "sentimiento"])}: cómo te escuchan tus clientes.`,
            icono: "Phone",
            miniatura: "mini-llamadas-y-satisfaccion.webp",
            pasos: [
                {
                    titulo: "Llamadas",
                    texto:
                        "Cuántas llamadas por WhatsApp hubo, cuántas se contestaron y su duración, y una gráfica de " +
                        "salientes y entrantes por día.",
                    imagen: "llamadas.webp",
                    alt: "El resumen de llamadas y las llamadas por día",
                },
                {
                    titulo: "Satisfacción (NPS) por asesor",
                    texto:
                        "Si tienes encendida la encuesta, aquí ves la nota del 1 al 10 que dejan tus clientes al " +
                        "cerrar una conversación, y el NPS de cada asesor.",
                    imagen: "nps.webp",
                    alt: "El resumen de la encuesta y el NPS por asesor",
                },
                {
                    titulo: "Sentimiento",
                    texto:
                        "Cuántas conversaciones pasaron a un cliente molesto, por asesor y por día. Solo cuenta si " +
                        "tienes encendido el análisis de sentimiento en tu perfil.",
                    imagen: "sentimiento.webp",
                    alt: "Las caídas a negativo por asesor y por día",
                },
            ],
        },
        {
            slug: "sesiones-y-flujos",
            titulo: "Sesiones, flujos y etiquetas",
            resumen: `${titulos(["sesiones", "flujos", "etiquetas"])}: cómo está organizada tu bandeja.`,
            icono: "GitBranch",
            miniatura: "mini-sesiones-y-flujos.webp",
            pasos: [
                {
                    titulo: "Sesiones",
                    texto:
                        "Cuántas conversaciones están activas y en cuántas el agente IA sigue respondiendo o está " +
                        "pausado porque las atiende una persona.",
                    imagen: "sesiones.webp",
                    alt: "El estado de las sesiones y del agente IA",
                },
                {
                    titulo: "Flujos",
                    texto:
                        "Tus flujos publicados y en borrador, y los que más conversaciones tienen en marcha.",
                    imagen: "flujos.webp",
                    alt: "El estado de los flujos y los más ejecutados",
                },
                {
                    titulo: "Etiquetas y madurez",
                    texto:
                        "Cuántos contactos lleva cada etiqueta, y si usas Lead, Prospecto y Cliente, cuántos hay en " +
                        "cada paso de madurez.",
                    imagen: "etiquetas.webp",
                    alt: "La madurez de los contactos y la distribución por etiquetas",
                },
            ],
        },
        {
            slug: "ventas-y-creditos",
            titulo: "Ventas, productos y créditos",
            resumen: `${titulos(["ventas", "productos", "sistema"])}: el dinero y el consumo de IA.`,
            icono: "Wallet",
            miniatura: "mini-ventas-y-creditos.webp",
            pasos: [
                {
                    titulo: "Ventas y gastos",
                    texto:
                        "Lo que vendiste y gastaste en el periodo según Finanzas, los gastos por categoría y las " +
                        "ventas semana a semana. Solo sale si tienes movimientos.",
                    imagen: "ventas.webp",
                    alt: "El resumen financiero, los gastos por categoría y las ventas",
                },
                {
                    titulo: "Productos",
                    texto:
                        "Tus productos con más inventario y cómo se reparten por categoría, con aviso de los que " +
                        "están por agotarse.",
                    imagen: "productos.webp",
                    alt: "Los productos con más stock y por categoría",
                },
                {
                    titulo: "Créditos IA",
                    texto:
                        "Cuántos créditos de IA has usado, cuántos te quedan y cuándo se renuevan. Son los de la " +
                        "cuenta con la que entraste.",
                    imagen: "creditos.webp",
                    alt: "El uso y la distribución de los créditos de IA",
                },
            ],
            consejos: ["Las ventas y los gastos se anotan en Finanzas: aquí solo se resumen."],
        },
    ],
};

/** Los periodos, tal como se nombran en la guía (para el banco). */
export const PERIODOS_DOCUMENTADOS = PERIODOS_DE_INFORMES.map((p) => p.rotulo);

/** La guía armada: su carpeta, su vídeo y la navegación (`lib/guia-de-modulo.ts`). */
export const GUIA = laGuiaDe("informes", GUIA_INFORMES);

export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
