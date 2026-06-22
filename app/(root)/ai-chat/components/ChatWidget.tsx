"use client";

import { useChatStore } from "../../../../stores/ai-chat/useChatStore";
import { ChatLauncher } from "./ChatLauncher";
import { ChatSheet } from "./ChatSheet";

export const ChatWidget = () => {
    const isOpen = useChatStore((s) => s.isOpen);
    const setOpen = useChatStore((s) => s.setOpen);

    return (
        <>
            <ChatLauncher open={isOpen} onOpenChange={setOpen} />
            <ChatSheet open={isOpen} onOpenChange={setOpen} />
        </>
    );
};
