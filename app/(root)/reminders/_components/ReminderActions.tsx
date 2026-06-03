
import { Button } from "@/components/ui/button"
import { Pencil, Trash2 } from "lucide-react"
import { openEditDialog, openDeleteDialog } from '@/stores';
import { Reminders } from "@prisma/client";
import TooltipWrapper from "@/components/TooltipWrapper";

export const ReminderActions = ({ reminder }: { reminder: Reminders }) => {
    return (
        <div className="flex items-center gap-1 shrink-0">
            <TooltipWrapper content="Editar">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                    aria-label="Editar recordatorio"
                    onClick={() => openEditDialog(reminder.id, reminder)}
                >
                    <Pencil className="h-3.5 w-3.5" />
                </Button>
            </TooltipWrapper>
            <TooltipWrapper content="Eliminar">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    aria-label="Eliminar recordatorio"
                    onClick={() => openDeleteDialog(reminder.id)}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </TooltipWrapper>
        </div>
    )
}
