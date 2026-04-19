import { AiClient } from "@/types/ai-assistence-chat";
import OpenAI from "openai";

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
