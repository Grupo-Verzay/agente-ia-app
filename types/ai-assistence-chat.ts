export type AppContextSnapshot = {
    pathname: string;
    params: Record<string, string>;
    search: Record<string, string>;
};

export type ChatRequest = {
    messages: ChatMessage[];
    context: AppContextSnapshot;
};

export type ChatResponse = {
    message: ChatMessage;
    suggestions?: string[];
};

export interface ChatGateway {
    send(req: ChatRequest): Promise<ChatResponse>;
}

export type AiInputMessage = { role: "user" | "assistant"; content: string };

export interface AiClient {
    complete(args: {
        apiKey: string;
        model: string;
        system: string;
        messages: AiInputMessage[];
    }): Promise<{ content: string }>;
}

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
    id: string;
    role: ChatRole;
    content: string;
    createdAt: number; // Date.now()
    meta?: {
        // opcional: útil a futuro (confianza, tags, etc.)
        confidence?: "high" | "medium" | "low";
        routeHint?: string; // si quieres setearlo explícito además del "Ruta: /..."
    };
};

export type ChatConversation = {
    id: string;
    createdAt: number;
    updatedAt: number;
    title?: string;
    messages: ChatMessage[];
};

export const AI_ROLES = ["user", "assistant"] as const;

export const DICTIONARY_COLS = [
    { key: "service", label: "Servicio" },
    { key: "notify", label: "Notificar" },
    { key: "start", label: "Inicio" },
    { key: "due", label: "Vencimiento" },
    { key: "daysLeft", label: "Días restantes" },
    { key: "client", label: "Cliente" },
    { key: "price", label: "Precio" },
    { key: "method", label: "Método" },
    { key: "paid", label: "Pagado" },
    { key: "access", label: "Acceso" }
];