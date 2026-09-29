/**
 * El MENÚ LATERAL tal como lo ve un CLIENTE de la plataforma, para sembrarlo
 * en la base de usar y tirar de las guías públicas.
 *
 * # Por qué existe
 *
 * La guía de Leads salía con el menú de la izquierda convertido en tres letras
 * sueltas —«C…», «E…», «L…»—, que desde fuera no se leen como un menú: se leen
 * como que no hay menú. La causa estaba en los datos de ejemplo, no en la
 * pantalla: se sembraban tres módulos con iconos de lucide («MessageCircle»,
 * «Users») y el menú dibuja los de `iconMap` (`schema/module.ts`, heroicons,
 * «ChatBubbleLeftRightIcon»…). Sin icono, el menú recogido enseña el nombre
 * recortado.
 *
 * # De dónde sale
 *
 * Es una FOTO de la tabla `Module` de producción, leída el 2026-09-29 (solo
 * lectura), con lo que ve una cuenta cliente: el panel del cliente
 * (`/client-panel`) y los módulos comunes. Los paneles de la casa, del equipo
 * y del reseller se quedan fuera —un cliente no los ve— y ningún `customUrl`
 * se copia: este repositorio es público y esas direcciones son internas.
 *
 * Los títulos se copian TAL CUAL, con sus espacios de más y todo («Embudos »):
 * es lo que se pinta. Si el menú de producción cambia, esta foto se queda
 * atrás; el banco (`lib/__tests__/menu-de-la-guia.test.mjs`) no puede saberlo,
 * pero sí exige que cada icono exista en `iconMap` y que Leads siga donde la
 * guía dice que está.
 */
export const FOTO_DEL_MENU = "2026-09-29";

/** Los seis niveles de plan, para los módulos abiertos a todos. */
const TODOS = ["lite", "basico", "intermedio", "avanzado", "enterprise", "personalizado"];

/**
 * `items` va en el orden en que se pintan (el de creación en producción).
 * `lockedPlans` va porque decide el candado: la cuenta de la guía es
 * `personalizado`, que no tiene ninguno.
 */
export const MENU_DE_UN_CLIENTE = [
    {
        label: "Panel",
        route: "/client-panel",
        icon: "ShieldCheckIcon",
        order: 3,
        items: [
            { title: "Embudos ", url: "/embudos" },
            { title: "Calificación", url: "/crm/kanban" },
            { title: "Catalogo", url: "/mis-catalogo" },
            { title: "Cobros", url: "/cobros" },
            { title: "Proyectos", url: "/proyectos" },
            { title: "Diagramas ", url: "/diagramas" },
            { title: "Reunion", url: "/reuniones", lockedPlans: ["lite", "basico", "intermedio", "avanzado"] },
            { title: "Mis tickets", url: "/mis-tickets", lockedPlans: ["lite", "basico", "intermedio", "avanzado"] },
            { title: "Finanzas", url: "/dashboard/finance" },
            { title: "Estadísticas", url: "/crm/dashboard" },
            { title: "Resumen", url: "/crm/reportes" },
        ],
    },
    {
        label: "Bandeja",
        route: "#container",
        icon: "ChatBubbleLeftRightIcon",
        order: 4,
        isContainer: true,
        items: [
            { title: "Chats", url: "/chats", lockedPlans: ["lite", "basico", "intermedio"] },
            { title: "Correos", url: "/correo", lockedPlans: ["lite", "basico", "intermedio", "avanzado", "enterprise"] },
            { title: "Llamadas", url: "/crm/llamadas", lockedPlans: ["lite", "basico", "intermedio", "avanzado"] },
        ],
    },
    { label: "Chats", route: "/chats", icon: "ChatBubbleLeftRightIcon", order: 5, showInSidebar: false, lockedPlans: ["lite", "basico"], items: [] },
    {
        label: "Llamadas",
        route: "/crm/llamadas",
        icon: "DevicePhoneMobileIcon",
        order: 6,
        showInSidebar: false,
        lockedPlans: ["lite", "basico", "intermedio", "avanzado"],
        items: [],
    },
    {
        label: "Contactos",
        route: "#container",
        icon: "IdentificationIcon",
        order: 7,
        items: [
            { title: "Leads", url: "/sessions" },
            { title: "Agenda", url: "/schedule", lockedPlans: ["lite", "basico", "intermedio"] },
            { title: "Etiquetas", url: "/tags", lockedPlans: ["lite"] },
        ],
    },
    {
        label: "Integraciones",
        route: "#container",
        icon: "PuzzlePieceIcon",
        order: 8,
        items: [
            { title: "Mis datos", url: "/my-data", lockedPlans: ["lite", "basico", "intermedio", "avanzado"] },
            { title: "Multiagenda", url: "/bookings", lockedPlans: ["lite", "basico", "intermedio", "avanzado", "enterprise"] },
            { title: "Google Sheets", url: "/google-sheets", lockedPlans: ["lite", "basico", "intermedio", "avanzado"] },
        ],
    },
    {
        label: "Herramientas",
        route: "#container",
        icon: "AdjustmentsHorizontalIcon",
        order: 9,
        items: [
            { title: "Copiloto", url: "/copiloto", lockedPlans: ["lite", "basico"] },
            { title: "Mis notas", url: "/notas", lockedPlans: ["lite"] },
            { title: "Mis tareas", url: "/tareas", lockedPlans: ["lite", "basico", "intermedio"] },
        ],
    },
    {
        label: "Apps Externas",
        route: "#container",
        icon: "LifebuoyIcon",
        order: 10,
        items: [
            { title: "Integrar urls", url: "/integraciones", lockedPlans: ["lite", "basico", "intermedio", "avanzado"] },
            { title: "AI imágenes", url: "/ai-image", lockedPlans: ["lite", "basico", "intermedio"] },
            { title: "Mis formularios", url: "/mis-formularios", lockedPlans: ["lite", "basico"] },
        ],
    },
    {
        label: "Entrenamiento",
        route: "#container",
        icon: "UsersIcon",
        order: 11,
        items: [
            { title: "Usuarios", url: "/equipo", lockedPlans: ["lite", "basico", "intermedio", "avanzado", "enterprise"] },
            { title: "Agente IA", url: "/ia" },
            { title: "Productos", url: "/products", lockedPlans: ["lite"] },
        ],
    },
    {
        label: "Creación de Flujos",
        route: "#container",
        icon: "SparklesIcon",
        order: 12,
        items: [
            { title: "Campañas", url: "/campaigns", lockedPlans: ["lite", "basico", "intermedio", "avanzado"] },
            { title: "Crear flujos", url: "/workflow", lockedPlans: ["lite", "basico"] },
            { title: "Follows ups IA", url: "/crm/rules", lockedPlans: ["lite", "basico", "intermedio", "avanzado"] },
        ],
    },
    {
        label: "Automatizaciones",
        route: "#container",
        icon: "BoltIcon",
        order: 13,
        items: [
            { title: "Mis macros", url: "/macros", lockedPlans: ["lite", "basico", "intermedio", "avanzado"] },
            { title: "Recordatorios", url: "/reminders", lockedPlans: ["lite", "basico", "intermedio"] },
            { title: "Respuestas Rápidas", url: "/auto-replies", lockedPlans: ["lite", "basico", "intermedio", "avanzado"] },
        ],
    },
    { label: "Conexión→ Ajustes", route: "/profile", icon: "Cog6ToothIcon", order: 14, items: [] },
];

/** Lo que el menú PINTA: los módulos con `showInSidebar`, en su orden. */
export function losQueSeVenEnElMenu(menu = MENU_DE_UN_CLIENTE) {
    return menu.filter((m) => m.showInSidebar !== false).sort((a, b) => a.order - b.order);
}

/** El módulo del menú donde vive una ruta (p. ej. `/sessions` → «Contactos»). */
export function elModuloDe(ruta, menu = MENU_DE_UN_CLIENTE) {
    return losQueSeVenEnElMenu(menu).find((m) => m.route === ruta || m.items.some((i) => i.url === ruta)) ?? null;
}

/** Cómo se escribe en `Module`: cada campo que no se da, con el valor de siempre. */
export function comoFilaDeModulo(m) {
    return {
        label: m.label,
        route: m.route,
        icon: m.icon,
        order: m.order,
        adminOnly: false,
        requiresPremium: false,
        showInSidebar: m.showInSidebar ?? true,
        isContainer: m.isContainer ?? false,
        allowedPlans: TODOS,
        lockedPlans: m.lockedPlans ?? [],
    };
}
