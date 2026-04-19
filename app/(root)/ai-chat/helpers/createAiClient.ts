import { OpenAiClient } from "@/actions/open-ai-actions";
import { AiClient } from "@/types/ai-assistence-chat";

export const createAiClient = (provider: string): AiClient => {
    const p = (provider || "").toLowerCase();
    if (p === "openai") return new OpenAiClient();

    // Si luego quieres Gemini: agregas GoogleAiClient aquí
    throw new Error(`Proveedor no soportado en chat: ${provider}`);
}