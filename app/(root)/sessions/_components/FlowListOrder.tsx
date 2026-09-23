import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import React from "react";
import { cn } from "@/lib/utils";
import { RELLENO_DE_PX_2 } from "@/lib/pastillas-de-la-fila";

type FlowEntry = { id: string; name: string };

function parseFlujos(raw: string): FlowEntry[] {
    const str = (raw ?? "").trim();
    if (!str || str === "-") return [];

    // New format: JSON array
    try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
            return parsed
                .filter((f): f is FlowEntry => !!f?.name)
                .map((f) => ({ id: String(f.id ?? f.name), name: String(f.name) }));
        }
    } catch {
        // fall through to legacy
    }

    // Legacy format: comma-separated names (use name as id fallback)
    return str
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => ({ id: name, name }));
}

/** `compacta`: en la fila de una tarjeta de Chats, 2 px menos de relleno por lado (`lib/pastillas-de-la-fila.ts`). */
export const FlowListOrder = ({ raw, compacta = false }: { raw: string; compacta?: boolean }) => {
    const flowsArr = parseFlujos(raw).sort((a, b) =>
        a.name.localeCompare(b.name, "es")
    );

    const count = flowsArr.length;

    if (count === 0) return null;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="inline-flex">
                        <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border border-blue-300 bg-blue-100 text-xs font-medium text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300", compacta ? RELLENO_DE_PX_2 : "px-2")}>
                            <span className="h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400" />
                            {count}
                        </span>
                    </span>
                </TooltipTrigger>

                {count > 0 && (
                    <TooltipContent side="top" sideOffset={6} className="z-[9999] max-w-[420px]">
                        <div className="space-y-1">
                            <div className="text-xs font-bold">Flujos</div>
                            <ul className="list-disc pl-4 text-xs space-y-0.5">
                                {flowsArr.map((f) => (
                                    <li key={f.id} className="break-words">
                                        {f.name}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </TooltipContent>
                )}
            </Tooltip>
        </TooltipProvider>
    );
};
