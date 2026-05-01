import { AiClient } from "@/types/ai-assistence-chat";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export class OpenAiClient implements AiClient {
    async complete(args: {
        apiKey: string;
        model: string;
        system: string;
        messages: { role: "user" | "assistant"; content: string }[];
    }): Promise<{ content: string }> {
        const openai = new OpenAI({ apiKey: args.apiKey });

        const res = await openai.chat.completions.create({
            model: args.model,
            messages: [
                { role: "system", content: args.system },
                ...args.messages,
            ],
            temperature: 0.2,
        });

        const content = res.choices?.[0]?.message?.content ?? "";
        return { content: content.trim() };
    }
}

export class GoogleAiClient implements AiClient {
    async complete(args: {
        apiKey: string;
        model: string;
        system: string;
        messages: { role: "user" | "assistant"; content: string }[];
    }): Promise<{ content: string }> {
        const genAI = new GoogleGenAI({ apiKey: args.apiKey });

        const contents = args.messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        }));

        const response = await genAI.models.generateContent({
            model: args.model,
            contents,
            config: {
                temperature: 0.2,
                systemInstruction: args.system,
            },
        });

        const text = response.text ?? "";
        return { content: text.trim() };
    }
}
