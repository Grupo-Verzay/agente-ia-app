"use client";

import { useChatStore } from "@/stores/ai-chat/useChatStore";
import { MessageBubble } from "./MessageBubble";
import { TypingBubble } from "./TypingBubble";

export function MessageList() {
    const messages = useChatStore((s) => s.messages);
    const isTyping = useChatStore((s) => s.isTyping);

    return (
        <div className="space-y-2">
            {messages.map((m) => (
                <MessageBubble key={m.id} role={m.role} content={m.content} />
            ))}
            {isTyping ? <TypingBubble /> : null}
        </div>
    );
}