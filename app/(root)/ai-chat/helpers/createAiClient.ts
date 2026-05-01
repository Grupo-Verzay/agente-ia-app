import { OpenAiClient, GoogleAiClient } from "@/actions/open-ai-actions";
import { AiClient } from "@/types/ai-assistence-chat";

export const createAiClient = (provider: string): AiClient => {
    const p = (provider || "").toLowerCase();
    if (p === "openai") return new OpenAiClient();
    if (p === "google") return new GoogleAiClient();
    throw new Error(`Proveedor no soportado en chat: ${provider}`);
}