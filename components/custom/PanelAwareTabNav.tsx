"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Suspense } from "react";

interface TabItem {
    url: string;
    title: string;
}

interface Props {
    tabs: TabItem[];
    /** Cuando es true, no muestra en rutas /panel/* (el panel layout ya lo maneja). */
    excludePanelRoutes?: boolean;
}

function splitUrl(url: string): { path: string; search: string } {
    const idx = url.indexOf("?");
    if (idx === -1) return { path: url, search: "" };
    return { path: url.slice(0, idx), search: url.slice(idx) };
}

function TabNavInner({ tabs, excludePanelRoutes }: Props) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentSearch = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const currentFullUrl = pathname + currentSearch;

    const isPanelRoute = pathname === "/panel" || pathname.startsWith("/panel/");

    const isSubmoduleRoute = tabs.some((tab) => {
        const { path } = splitUrl(tab.url);
        return pathname === path || pathname.startsWith(path + "/");
    });

    if (excludePanelRoutes) {
        if (!isSubmoduleRoute || isPanelRoute) return null;
    } else {
        if (!isPanelRoute && !isSubmoduleRoute) return null;
    }

    // ¿Algún tab con query params coincide exactamente con la URL actual?
    const slottedTabActive = tabs.some((tab) => {
        const { search } = splitUrl(tab.url);
        return search !== "" && currentFullUrl === tab.url;
    });

    return (
        <div className="sticky top-0 z-10 bg-background border-b border-border mb-2">
            <ScrollArea className="w-full">
                <nav className="flex gap-1">
                    {tabs.map((tab) => {
                        const { path: tabPath, search: tabSearch } = splitUrl(tab.url);

                        let active: boolean;
                        if (tabSearch) {
                            // Tab con query params → coincidencia exacta
                            active = currentFullUrl === tab.url;
                        } else {
                            // Tab sin query params → activo solo si ningún tab con slot está activo
                            active =
                                !slottedTabActive &&
                                (pathname === tabPath || pathname.startsWith(tabPath + "/"));
                        }

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

export function PanelAwareTabNav(props: Props) {
    return (
        <Suspense>
            <TabNavInner {...props} />
        </Suspense>
    );
}
