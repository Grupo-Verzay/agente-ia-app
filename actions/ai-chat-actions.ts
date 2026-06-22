"use server";

import { AppContextSnapshot, ChatMessage } from "@/types/ai-assistence-chat";
import { ActionResult, resolveUserAiClient } from "./userAiconfig-actions";
import { currentUser } from "@/lib/auth";
import { toAiMessages } from "@/app/(root)/ai-chat/helpers/toAiMessages";
import { createAiClient } from "@/app/(root)/ai-chat/helpers/createAiClient";
import { getPromptAssistence } from "./ai-actions";
import {
    COPILOT_MODE_INSTRUCTIONS,
    COPILOT_MODE_LABELS,
    resolveCopilotMode,
} from "@/app/(root)/ai-chat/copilot";

export type ChatRequest = {
    messages: ChatMessage[];
    context: AppContextSnapshot;
};

export type ChatResponse = {
    message: ChatMessage;
    suggestions?: string[];
};

const AI_TIMEOUT_MS = 20000;

function createAssistantMessage(content: string): ChatMessage {
    return {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        createdAt: Date.now(),
    };
}

function getLastUserText(messages: ChatMessage[]) {
    return [...messages].reverse().find((message) => message.role === "user")?.content?.trim() ?? "";
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function truncateText(value: string, maxLength = 160) {
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}

function isDiagnosticRequest(messages: ChatMessage[]) {
    const text = normalizeText(getLastUserText(messages));
    return /(diagnostico|diagnosticar|probar ia|probar conexion|api key|apikey|proveedor|modelo)/.test(text);
}

async function buildAiDiagnosticMessage(userId: string): Promise<ChatMessage> {
    const resolved = await resolveUserAiClient(userId);

    if (resolved.success && resolved.data) {
        return createAssistantMessage(`Tu configuracion IA esta lista para usarse.

Pasos:
1) Proveedor activo: ${resolved.data.provider}
2) Modelo activo: ${resolved.data.model}
3) API key: configurada
4) Si hay timeout, revisa saldo, permisos del proveedor o conectividad.

Ruta sugerida: /profile
Acciones sugeridas: [Revisar configuracion]
Nota de verificacion: no muestro la API key por seguridad.`);
    }

    const messageMap: Record<string, string> = {
        user_missing_defaults: "No tienes proveedor o modelo predeterminado configurado.",
        user_missing_active_apikey: "No tienes una API key activa para el proveedor predeterminado.",
        provider_or_model_invalid: "El proveedor o modelo predeterminado no es valido.",
        resolve_ai_client_error: "No pude leer la configuracion IA del usuario.",
    };

    return createAssistantMessage(`La configuracion IA necesita revision.

Pasos:
1) Problema detectado: ${messageMap[resolved.message] ?? resolved.message}
2) Abre Perfil.
3) Configura proveedor, modelo y API key activa.
4) Guarda y vuelve a probar el copiloto.

Ruta sugerida: /profile
Acciones sugeridas: [Revisar configuracion]
Nota de verificacion: el copiloto puede responder con guias internas, pero para respuestas generativas necesita esta configuracion.`);
}

function buildLocalCopilotResponse(req: ChatRequest, reason?: string): ChatMessage | null {
    const text = normalizeText(getLastUserText(req.messages));
    if (!text) return null;

    const prefix = reason
        ? "No pude consultar el modelo IA ahora, pero puedo guiarte con una respuesta interna.\n\n"
        : "";

    if (/(explicar pantalla|que puedo hacer|acciones utiles|ubicar modulo|donde encuentro)/.test(text)) {
        const pathname = req.context.pathname || "/";
        const moduleLabel = req.context.moduleLabel || "esta seccion";
        const mode = req.context.resolvedCopilotMode || resolveCopilotMode(req.context.copilotMode ?? "auto", pathname);

        return createAssistantMessage(`${prefix}Estas en ${moduleLabel}. Puedo ayudarte a ubicar funciones, revisar configuracion y proponer siguientes pasos segun el modulo activo.

Pasos:
1) Revisa la pantalla actual y dime que quieres lograr.
2) Usa los chips de abajo para pedirme una accion rapida.
3) Si necesitas cambiar de modulo, puedo sugerirte la ruta correcta.

Ruta sugerida: ${pathname}
Acciones sugeridas: [Abrir modulo] [Revisar configuracion]
Nota de verificacion: modo activo del copiloto: ${mode}.`);
    }

    if (/(whatsapp|conexion|conectar|qr|instancia|baileys|meta)/.test(text)) {
        return createAssistantMessage(`${prefix}Para conectar WhatsApp, entra al modulo de conexiones y crea o revisa tu instancia.

Pasos:
1) Abre el modulo Conexiones.
2) Elige el tipo de conexion que vas a usar: WhatsApp QR/Baileys o Meta, segun tu configuracion.
3) Si es QR, escanea el codigo con el WhatsApp del negocio.
4) Verifica que la instancia quede activa antes de probar mensajes.

Ruta sugerida: /connection
Acciones sugeridas: [Abrir modulo] [Revisar configuracion]
Nota de verificacion: si no ves la opcion, revisa permisos, plan o si tu usuario es asesor.`);
    }

    if (/(api key|apikey|openai|proveedor|modelo|ia)/.test(text)) {
        return createAssistantMessage(`${prefix}La configuracion de proveedor IA se revisa desde el perfil del usuario.

Pasos:
1) Abre Perfil.
2) Busca la seccion de API Key IA o proveedor IA.
3) Verifica que tengas proveedor, modelo y API key activos.
4) Guarda y prueba de nuevo el copiloto.

Ruta sugerida: /profile
Acciones sugeridas: [Revisar configuracion] [Diagnostico IA]
Nota de verificacion: una API key invalida o sin saldo puede provocar timeouts o errores del copiloto.`);
    }

    if (/(prompt|instruccion|agente|entrenamiento)/.test(text)) {
        return createAssistantMessage(`${prefix}Las instrucciones del agente se trabajan desde el modulo IA.

Pasos:
1) Abre el modulo IA.
2) Revisa las secciones de negocio, entrenamiento, preguntas frecuentes y productos.
3) Publica los cambios cuando el prompt quede listo.

Ruta sugerida: /ia
Acciones sugeridas: [Abrir modulo] [Revisar instrucciones]`);
    }

    if (/(workflow|flujo|automatizacion|nodo)/.test(text)) {
        return createAssistantMessage(`${prefix}Los flujos y automatizaciones se gestionan desde Workflow.

Pasos:
1) Abre Workflow.
2) Selecciona un flujo existente o crea uno nuevo.
3) Revisa nodos, intenciones y acciones conectadas.

Ruta sugerida: /workflow
Acciones sugeridas: [Abrir modulo] [Disenar flujo]`);
    }

    if (/(sugerir respuesta|resumir chat|conversacion|proximo seguimiento)/.test(text)) {
        const chat = req.context.chatContext;
        const lastMessages = chat?.recentMessages?.length
            ? chat.recentMessages
                .slice(-4)
                .map((message) => `- ${message.sender === "user" ? "Asesor" : "Cliente"}: ${message.content}`)
                .join("\n")
            : "";
        const lastClientMessage = chat?.recentMessages
            ?.slice()
            .reverse()
            .find((message) => message.sender !== "user" && message.content?.trim());
        const greeting = chat?.contactName ? `Hola ${chat.contactName}` : "Hola";
        const suggestedReply = lastClientMessage
            ? `${greeting}, claro, con gusto. Sobre tu mensaje: "${truncateText(lastClientMessage.content, 120)}". Te confirmo la informacion y quedo atento para ayudarte con el siguiente paso.`
            : "Hola, claro, con gusto te ayudo. Cuentame un poco mas para confirmarte la informacion correcta y avanzar con el siguiente paso.";

        if (chat?.recentMessages?.length) {
            return createAssistantMessage(`${prefix}Puedo ayudarte con esta conversacion de ${chat.contactName ?? "este cliente"}.

Resumen rapido:
${lastMessages}

Intencion: responder al cliente con contexto y dejar seguimiento si queda pendiente.
Ultimo mensaje: ${lastClientMessage ? truncateText(lastClientMessage.content) : "No encontre un ultimo mensaje del cliente."}
Proxima accion: enviar una respuesta corta y crear tarea si requiere seguimiento.

Respuesta sugerida:
${suggestedReply}

Ruta sugerida: /chats
Acciones sugeridas: [Usar respuesta] [Sugerir mensaje] [Crear tarea] [Crear nota] [Marcar caliente]`);
        }

        return createAssistantMessage(`${prefix}Para trabajar una conversacion, abre el chat del cliente y usa el copiloto para redactar o resumir con el contexto visible.

Pasos:
1) Abre el modulo Chats.
2) Selecciona el cliente.
3) Copia el ultimo mensaje o describe el caso si quieres una respuesta mas precisa.
4) Puedes crear una tarea de seguimiento si el cliente queda pendiente.

Ruta sugerida: /chats
Acciones sugeridas: [Sugerir mensaje] [Crear tarea]`);
    }

    if (/(crm|lead|seguimiento|cliente|estado|tarea)/.test(text)) {
        return createAssistantMessage(`${prefix}Para trabajar leads, estados y seguimientos, entra al CRM.

Pasos:
1) Abre CRM.
2) Busca el lead o registro.
3) Revisa estado, seguimiento y tareas pendientes.

Ruta sugerida: /crm
Acciones sugeridas: [Abrir CRM] [Crear tarea] [Revisar seguimiento]`);
    }

    return null;
}

function timeoutError(label: string) {
    return new Error(`${label}_timeout`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(label)), ms);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function buildSystemPrompt(ctx: AppContextSnapshot) {
    let AI_SUPPORT_KB = "";

    try {
        const kb = await withTimeout(getPromptAssistence(), 8000, "support_kb");
        AI_SUPPORT_KB = (kb ?? "").trim();
    } catch (error) {
        console.error("Error al obtener el KB de soporte:", error);
        AI_SUPPORT_KB = "";
    }

    const resolvedMode = resolveCopilotMode(ctx.copilotMode ?? "auto", ctx.pathname);
    const modeLabel = COPILOT_MODE_LABELS[resolvedMode];
    const modeInstructions = COPILOT_MODE_INSTRUCTIONS[resolvedMode];

    return `
Eres Copiloto IA, un asistente interno y nativo de Agente IA App.

OBJETIVO:
Ayudar al usuario a trabajar dentro de la aplicacion como copiloto: orientar, explicar, proponer acciones, redactar, resumir y abrir rutas internas cuando sea util.

MODO ACTIVO:
${modeLabel}

INSTRUCCIONES DEL MODO:
${modeInstructions}

REGLAS:
- Prioriza el contexto actual (ruta, modulo, params/search) para orientar la respuesta.
- Puedes guiar a otras pantallas si es mejor.
- No inventes pantallas, botones, campos, datos ni flujos.
- Usa la BASE DE CONOCIMIENTO (KB) como fuente principal.
- Si la respuesta no esta en la KB, usa el contexto de la ruta con prudencia y pide 1 dato puntual si falta informacion.
- No afirmes que creaste, editaste, enviaste o eliminaste algo. Solo puedes sugerirlo o indicar los pasos.
- Si recomiendas una accion interna, nombrala como opcion: [Crear tarea], [Crear nota], [Sugerir mensaje], [Usar respuesta], [Marcar frio], [Marcar tibio], [Marcar caliente], [Marcar finalizado], [Abrir modulo], [Revisar configuracion].
- Responde en espanol, claro y directo.

FORMATO OBLIGATORIO DE RESPUESTA:
1) Respuesta breve (1-2 lineas)
2) Pasos numerados
3) Ruta sugerida: "Ruta: /xxx/yyy" (si aplica)
4) Acciones sugeridas: [Accion] [Accion] (si aplica)
5) Nota de verificacion (si aplica: permisos/rol/estado)

CONTEXTO ACTUAL:
pathname: ${ctx.pathname}
routeSegment: ${ctx.routeSegment ?? ""}
moduleLabel: ${ctx.moduleLabel ?? ""}
copilotModeSolicitado: ${ctx.copilotMode ?? "auto"}
copilotModeResuelto: ${resolvedMode}
params: ${JSON.stringify(ctx.params)}
search: ${JSON.stringify(ctx.search)}
chatContext: ${JSON.stringify(ctx.chatContext ?? null)}

BASE DE CONOCIMIENTO (KB):
<<<KB_START>>>
${AI_SUPPORT_KB}
<<<KB_END>>>

- No repitas encabezados internos del documento si no son parte de una instruccion al usuario final.
`.trim();
}

export async function sendChatAction(
    req: ChatRequest
): Promise<ActionResult<ChatResponse>> {
    try {
        const user = await currentUser();
        if (!user?.id) return { success: false, message: "auth_required" };

        if (isDiagnosticRequest(req.messages)) {
            return {
                success: true,
                message: "ai_diagnostic",
                data: { message: await buildAiDiagnosticMessage(user.id) },
            };
        }

        const localResponse = buildLocalCopilotResponse(req);
        if (localResponse) {
            return {
                success: true,
                message: "local_copilot_response",
                data: { message: localResponse },
            };
        }

        const resolved = await resolveUserAiClient(user.id);
        if (!resolved.success || !resolved.data) return { success: false, message: resolved.message };

        const { provider, model, apiKey } = resolved.data;

        const ai = createAiClient(provider);
        const system = await buildSystemPrompt(req.context);
        const msgs = toAiMessages(req.messages);

        const result = await withTimeout(
            ai.complete({
                apiKey,
                model,
                system,
                messages: msgs,
            }),
            AI_TIMEOUT_MS,
            "ai_completion",
        );

        const content =
            (result.content || "").trim() ||
            "No pude generar una respuesta. Puedes reformular tu pregunta?";

        return {
            success: true,
            message: "ok",
            data: {
                message: {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content,
                    createdAt: Date.now(),
                },
            },
        };
    } catch (error) {
        console.error("[sendChatAction]", error);
        const fallback = buildLocalCopilotResponse(req, "ai_unavailable");
        if (fallback) {
            return {
                success: true,
                message: "local_copilot_fallback",
                data: { message: fallback },
            };
        }

        const message = error instanceof Error && error.message.includes("timeout")
            ? "El copiloto tardo demasiado en responder. Intenta nuevamente."
            : "No pude consultar el copiloto en este momento.";

        return { success: false, message };
    }
}
