import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import React from "react";

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

export const FlowListOrder = ({ raw }: { raw: string }) => {
    const flowsArr = parseFlujos(raw).sort((a, b) =>
        a.name.localeCompare(b.name, "es")
    );

    const count = flowsArr.length;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="inline-flex">
                        {count === 0 ? (
                            <span className="inline-flex rounded-full border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
                                Sin flujos
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                <span className="h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400" />
                                {count}
                            </span>
                        )}
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
