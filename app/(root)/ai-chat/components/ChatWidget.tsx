"use client";

import { useChatStore } from "../../../../stores/ai-chat/useChatStore";
import { ChatSheet } from "./ChatSheet";

export const ChatWidget = () => {
    const isOpen = useChatStore((s) => s.isOpen);
    const setOpen = useChatStore((s) => s.setOpen);

    return <ChatSheet open={isOpen} onOpenChange={setOpen} />;
};
