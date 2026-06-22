"use client";

import { AppContextSnapshot } from "@/types/ai-assistence-chat";
import { breadcrumbLabels } from "@/components/custom";
import { useChatStore } from "@/stores/ai-chat/useChatStore";
import { usePathname, useParams, useSearchParams } from "next/navigation";
import { resolveCopilotMode } from "../copilot";



function paramsToObject(p: ReturnType<typeof useParams>) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(p ?? {})) {
        if (Array.isArray(v)) out[k] = v.join("/");
        else if (typeof v === "string") out[k] = v;
    }
    return out;
}

function searchParamsToObject(sp: ReturnType<typeof useSearchParams>) {
    const out: Record<string, string> = {};
    sp.forEach((value, key) => (out[key] = value));
    return out;
}

function getStoredChatContext(): AppContextSnapshot["chatContext"] {
    if (typeof window === "undefined") return null;

    try {
        const raw = window.localStorage.getItem("verzay_active_chat_context_v1");
        if (!raw) return null;
        return JSON.parse(raw) as AppContextSnapshot["chatContext"];
    } catch {
        return null;
    }
}

export function useChatContext(): AppContextSnapshot {
    const pathname = usePathname() ?? "/";
    const params = paramsToObject(useParams());
    const search = searchParamsToObject(useSearchParams());
    const copilotMode = useChatStore((s) => s.copilotMode);
    const routeSegment = pathname.split("/").filter(Boolean)[0] ?? "";
    const moduleLabel = (breadcrumbLabels[routeSegment] ?? routeSegment.replace(/-/g, " ")) || "inicio";
    const resolvedCopilotMode = resolveCopilotMode(copilotMode, pathname);
    const chatContext = pathname.startsWith("/chats") ? getStoredChatContext() : null;

    return {
        pathname,
        params,
        search,
        routeSegment,
        moduleLabel,
        copilotMode,
        resolvedCopilotMode,
        chatContext,
    };
}
