"use client";

import { AppContextSnapshot } from "@/types/ai-assistence-chat";
import { usePathname, useParams, useSearchParams } from "next/navigation";



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

export function useChatContext(): AppContextSnapshot {
    const pathname = usePathname() ?? "/";
    const params = paramsToObject(useParams());
    const search = searchParamsToObject(useSearchParams());
    return { pathname, params, search };
}