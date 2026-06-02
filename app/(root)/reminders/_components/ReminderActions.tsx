
import { Button } from "@/components/ui/button"
import { Pencil, Trash2 } from "lucide-react"
import { openEditDialog, openDeleteDialog } from '@/stores';
import { Reminders } from "@prisma/client";
import TooltipWrapper from "@/components/TooltipWrapper";

export const ReminderActions = ({ reminder }: { reminder: Reminders }) => {
    return (
        <div className="flex items-center gap-1 shrink-0">
            <TooltipWrapper content="Editar recordatorio">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    aria-label="Editar recordatorio"
                    onClick={() => openEditDialog(reminder.id, reminder)}
                >
                    <Pencil className="h-3.5 w-3.5" />
                </Button>
            </TooltipWrapper>
            <TooltipWrapper content="Eliminar recordatorio">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    aria-label="Eliminar recordatorio"
                    onClick={() => openDeleteDialog(reminder.id)}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </TooltipWrapper>
        </div>
    )
}
