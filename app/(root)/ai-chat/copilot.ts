import {
    Bot,
    MessageCircle,
    Network,
    Settings2,
    Sparkles,
    UsersRound,
} from "lucide-react";

export const COPILOT_MODES = ["auto", "general", "crm", "chats", "flows", "settings"] as const;

export type CopilotMode = (typeof COPILOT_MODES)[number];

export const COPILOT_MODE_LABELS: Record<CopilotMode, string> = {
    auto: "Auto",
    general: "General",
    crm: "CRM",
    chats: "Chats",
    flows: "Flujos",
    settings: "Config",
};

export const COPILOT_MODE_ICONS = {
    auto: Sparkles,
    general: Bot,
    crm: UsersRound,
    chats: MessageCircle,
    flows: Network,
    settings: Settings2,
} satisfies Record<CopilotMode, React.ComponentType<{ className?: string }>>;

export const COPILOT_MODE_DESCRIPTIONS: Record<CopilotMode, string> = {
    auto: "Detecta el mejor copiloto segun la pantalla.",
    general: "Guia por rutas, modulos y pasos de uso.",
    crm: "Ayuda con leads, seguimientos, tareas y ventas.",
    chats: "Sugiere respuestas, resume conversaciones y orienta atencion.",
    flows: "Apoya prompts, workflows, nodos y automatizaciones.",
    settings: "Ayuda con conexiones, perfil, API keys e integraciones.",
};

export const COPILOT_MODE_INSTRUCTIONS: Record<Exclude<CopilotMode, "auto">, string> = {
    general: [
        "Actua como copiloto general de la app.",
        "Ayuda a ubicar modulos, explicar pantallas y dar pasos claros.",
        "Cuando aplique, incluye una ruta interna exacta.",
    ].join("\n"),
    crm: [
        "Actua como copiloto CRM.",
        "Prioriza leads, estados, seguimientos, tareas, reportes, kanban y ventas.",
        "Sugiere siguientes acciones utiles como crear tarea, cambiar estado o enviar mensaje, pero no afirmes que ya las ejecutaste.",
    ].join("\n"),
    chats: [
        "Actua como copiloto de chats y atencion.",
        "Ayuda a redactar respuestas, resumir conversaciones, detectar intencion del cliente y proponer seguimientos.",
        "Si falta el contenido de una conversacion, pide que el usuario lo comparta o que abra el chat correspondiente.",
    ].join("\n"),
    flows: [
        "Actua como copiloto de flujos y automatizaciones.",
        "Ayuda a crear prompts, mejorar instrucciones, disenar workflows, revisar nodos e intenciones.",
        "Da estructuras listas para copiar cuando el usuario pida prompts o reglas.",
    ].join("\n"),
    settings: [
        "Actua como copiloto de configuracion.",
        "Ayuda con conexiones, WhatsApp, OpenAI, perfil, integraciones, permisos, planes y modulos.",
        "Advierte cuando una accion depende de rol, plan, permisos o credenciales.",
    ].join("\n"),
};

const ROUTE_MODE_MATCHERS: Array<{ mode: Exclude<CopilotMode, "auto">; match: RegExp }> = [
    { mode: "crm", match: /^\/crm(\/|$)|^\/clientes(\/|$)|^\/tareas(\/|$)|^\/cotizaciones(\/|$)/ },
    { mode: "chats", match: /^\/chats(\/|$)|^\/sessions(\/|$)|^\/auto-replies(\/|$)/ },
    { mode: "flows", match: /^\/workflow(\/|$)|^\/flow(\/|$)|^\/ai(\/|$)|^\/ia(\/|$)|^\/tools(\/|$)/ },
    { mode: "settings", match: /^\/connection(\/|$)|^\/integraciones(\/|$)|^\/profile(\/|$)|^\/panel(\/|$)|^\/credits(\/|$)|^\/evo(\/|$)|^\/google-sheets(\/|$)/ },
];

export function resolveCopilotMode(mode: CopilotMode, pathname: string): Exclude<CopilotMode, "auto"> {
    if (mode !== "auto") return mode;

    const normalizedPathname = pathname || "/";
    const routeMatch = ROUTE_MODE_MATCHERS.find((item) => item.match.test(normalizedPathname));
    return routeMatch?.mode ?? "general";
}
