import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserCheck } from "lucide-react";
import { getAdvisorsForTaskAction } from "@/actions/task-actions";
import { AdvisorKanbanBoard } from "./components/AdvisorKanbanBoard";

export default async function AsesoresPage() {
    const user = await currentUser();
    if (!user) redirect("/login");

    const res = await getAdvisorsForTaskAction();
    const advisors = res.data ?? [];

    return (
        <div data-full-bleed className="flex h-full min-w-0 w-full flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
                <UserCheck className="h-4 w-4 text-primary" />
                <h1 className="text-sm font-semibold">Pipeline de asesores</h1>
                <span className="text-xs text-muted-foreground">
                    Arrastra un contacto a un asesor para asignarlo; ⚙ configura las automatizaciones que se disparan al asignar.
                </span>
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
                <AdvisorKanbanBoard userId={user.effectiveId} advisors={advisors} />
            </div>
        </div>
    );
}
