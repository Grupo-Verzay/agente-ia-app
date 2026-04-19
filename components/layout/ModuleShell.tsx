import { cookies } from "next/headers";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Breadcrumbs } from "@/components/custom";
import { themeClass } from "@/types/generic";

type Props = {
    children: React.ReactNode;
    padded?: boolean;
    breadcrumbs?: boolean;
    isFlow?: boolean;
    sidebar?: React.ReactNode;
    insetActions?: React.ReactNode;
};

export default async function ModuleShell({
    children,
    padded = true,
    breadcrumbs = true,
    isFlow,
    sidebar,
    insetActions,
}: Props) {
    const cookieStore = await cookies();
    const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

    return (
        <SidebarProvider defaultOpen={defaultOpen} style={
            {
                '--sidebar-width': '21rem',
                '--sidebar-width-mobile': '21rem',
            } as React.CSSProperties
        }>
            {sidebar}

            <SidebarInset className="h-screen flex flex-col min-h-0">
                {breadcrumbs && (
                    <div className="shrink-0 flex items-center justify-between gap-2">
                        <Breadcrumbs isFlow={isFlow} />
                        {insetActions ? <div className="pr-2">{insetActions}</div> : null}
                    </div>
                )}

                {padded ? (
                    <main className={`flex-1 min-h-0 overflow-auto p-4 ${themeClass}`}>
                        {children}
                    </main>
                ) : (
                    <main className={`flex-1 min-h-0 w-full ${themeClass} overflow-auto`}>
                        {children}
                    </main>
                )}
            </SidebarInset>
        </SidebarProvider>
    );
}