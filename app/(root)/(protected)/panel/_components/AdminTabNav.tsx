"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface TabItem {
    url: string;
    title: string;
}

export function AdminTabNav({ tabs }: { tabs: TabItem[] }) {
    const pathname = usePathname();

    if (!tabs.length) return null;

    return (
        <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-background">
            <ScrollArea className="w-full">
                <nav className="flex px-2">
                    {tabs.map((tab) => {
                        const active =
                            tab.url === "/admin"
                                ? pathname === "/admin"
                                : pathname === tab.url || pathname.startsWith(tab.url + "/");

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
