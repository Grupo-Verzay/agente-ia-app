import { Skeleton } from "@/components/ui/skeleton";

export function ScheduleAvailabilitySkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
                <div
                    key={index}
                    className="flex justify-between items-center rounded-md border border-border bg-background px-3 py-1"
                >
                    {/* Día y horario */}
                    <div className="flex flex-col">
                        <Skeleton className="h-4 w-40 rounded" />
                    </div>

                    {/* Botón eliminar */}
                    <Skeleton className="h-9 w-9 rounded-md" />
                </div>
            ))}
        </div>
    );
}
