"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface TabItem {
    url: string;
    title: string;
}

interface Props {
    tabs: TabItem[];
    /** Cuando es true, no muestra en rutas /panel/* (el panel layout ya lo maneja). */
    excludePanelRoutes?: boolean;
}

export function PanelAwareTabNav({ tabs, excludePanelRoutes = false }: Props) {
    const pathname = usePathname();

    if (!tabs.length) return null;

    const isPanelRoute = pathname === "/panel" || pathname.startsWith("/panel/");
    const isSubmoduleRoute = tabs.some(
        (tab) => pathname === tab.url || pathname.startsWith(tab.url + "/")
    );

    if (excludePanelRoutes) {
        if (!isSubmoduleRoute || isPanelRoute) return null;
    } else {
        if (!isPanelRoute && !isSubmoduleRoute) return null;
    }

    return (
        <div className="sticky top-0 z-10 bg-background border-b border-border mb-2">
            <ScrollArea className="w-full">
                <nav className="flex gap-1">
                    {tabs.map((tab) => {
                        const active =
                            pathname === tab.url ||
                            pathname.startsWith(tab.url + "/");
                        return (
                            <Link
                                key={tab.url}
                                href={tab.url}
                                className={cn(
                                    "inline-flex items-center whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2",
                                    active
                                        ? "border-primary text-foreground"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                                )}
                            >
                                {tab.title}
                            </Link>
                        );
                    })}
                </nav>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
        </div>
    );
}
