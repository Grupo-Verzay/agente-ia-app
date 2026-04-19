import type { ChatMessage } from "@/types/ai-assistence-chat";

export function mergeBufferedUserMessages(buffer: ChatMessage[]): string {
  return buffer.map((m) => m.content.trim()).filter(Boolean).join("\n");
}