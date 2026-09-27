import { AiClient } from "@/types/ai-assistence-chat";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export class OpenAiClient implements AiClient {
    async complete(args: {
        apiKey: string;
        model: string;
        system: string;
        messages: { role: "user" | "assistant"; content: string }[];
    }): Promise<{ content: string; tokens?: number }> {
        const openai = new OpenAI({ apiKey: args.apiKey });

        const res = await openai.chat.completions.create({
            model: args.model,
            messages: [
                { role: "system", content: args.system },
                ...args.messages,
            ],
            temperature: 0,
        });

        const content = res.choices?.[0]?.message?.content ?? "";
        // Los tokens viajan para que quien llama los descuente de la cuenta
        // dueña: todo uso de IA se cobra (ver `lib/cobro-de-ia.ts`).
        return { content: content.trim(), tokens: res.usage?.total_tokens ?? undefined };
    }
}

export class GoogleAiClient implements AiClient {
    async complete(args: {
        apiKey: string;
        model: string;
        system: string;
        messages: { role: "user" | "assistant"; content: string }[];
    }): Promise<{ content: string; tokens?: number }> {
        const genAI = new GoogleGenAI({ apiKey: args.apiKey });

        const contents = args.messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        }));

        const response = await genAI.models.generateContent({
            model: args.model,
            contents,
            config: {
                temperature: 0,
                systemInstruction: args.system,
            },
        });

        const text = response.text ?? "";
        return { content: text.trim(), tokens: response.usageMetadata?.totalTokenCount ?? undefined };
    }
}
