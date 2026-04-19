import { AI_ROLES, AiInputMessage, ChatRole } from "@/types/ai-assistence-chat";

export const isAiRole = (role: ChatRole): role is AiInputMessage["role"] => {
    return (AI_ROLES as readonly string[]).includes(role);
}