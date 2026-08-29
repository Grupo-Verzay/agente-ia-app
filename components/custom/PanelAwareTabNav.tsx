"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MouseEvent, Suspense, useEffect, useMemo, useState, useTransition } from "react";

interface TabItem {
    url: string;
    title: string;
    /** Bloqueada por el plan: candado y, al pulsar, /planes en vez del contenido. */
    locked?: boolean;
}

interface Props {
    tabs: TabItem[];
    /** Cuando es true, no muestra dentro de la raiz del panel porque su layout ya lo maneja. */
    excludePanelRoutes?: boolean;
    panelRoutes?: string[];
}

function splitUrl(url: string): { path: string; search: string } {
    const idx = url.indexOf("?");
    if (idx === -1) return { path: url, search: "" };
    return { path: url.slice(0, idx), search: url.slice(idx) };
}

function TabNavInner({ tabs, excludePanelRoutes, panelRoutes = ["/panel"] }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const [optimisticUrl, setOptimisticUrl] = useState<string | null>(null);
    const currentSearch = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const currentFullUrl = pathname + currentSearch;
    const visibleTabUrls = useMemo(
        () => tabs.filter((tab) => !tab.locked).map((tab) => tab.url),
        [tabs],
    );

    useEffect(() => {
        setOptimisticUrl(null);
    }, [currentFullUrl]);

    useEffect(() => {
        visibleTabUrls.forEach((url) => router.prefetch(url));
    }, [router, visibleTabUrls]);

    const isPanelRoute = panelRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"));

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

    const handleNavigate = (
        event: MouseEvent<HTMLAnchorElement>,
        url: string,
        active: boolean,
        locked?: boolean,
    ) => {
        // La pestaña bloqueada se ve pero no lleva a ningún lado. No se manda a
        // /planes como en el sidebar: estas pestañas son del panel, y quien las
        // ve es un administrador, que no se cambia el plan a sí mismo.
        if (locked) {
            event.preventDefault();
            return;
        }
        if (active || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

        event.preventDefault();
        setOptimisticUrl(url);
        startTransition(() => {
            router.push(url);
        });
    };

    return (
        <div className="sticky top-0 z-10 bg-background border-b border-border mb-2">
            {isPending ? (
                <div className="absolute left-0 top-0 h-0.5 w-full overflow-hidden bg-primary/10">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
                </div>
            ) : null}
            <ScrollArea className="w-full">
                <nav className="flex gap-1">
                    {tabs.map((tab) => {
                        const { path: tabPath, search: tabSearch } = splitUrl(tab.url);
                        const optimisticActive = optimisticUrl === tab.url;

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
                        const isActive = optimisticActive || active;

                        return (
                            <Link
                                key={tab.url}
                                href={tab.url}
                                prefetch
                                onClick={(event) => handleNavigate(event, tab.url, active, tab.locked)}
                                onMouseEnter={() => !tab.locked && router.prefetch(tab.url)}
                                onFocus={() => !tab.locked && router.prefetch(tab.url)}
                                title={tab.locked ? 'No disponible en tu plan' : undefined}
                                className={cn(
                                    "inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-3 text-base font-medium transition-colors border-b-2",
                                    isActive
                                        ? "border-primary text-foreground"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                                )}
                            >
                                {tab.title}
                                {tab.locked && <Lock className="h-3.5 w-3.5 text-orange-400" />}
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
