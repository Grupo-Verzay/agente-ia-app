import { AiInputMessage, ChatMessage } from "@/types/ai-assistence-chat";
import { isAiRole } from "./isAiRole";

export function toAiMessages(messages: ChatMessage[]): AiInputMessage[] {
    return messages
        .filter((m): m is ChatMessage & { role: AiInputMessage["role"] } => isAiRole(m.role))
        .map((m) => ({ role: m.role, content: m.content }));
}