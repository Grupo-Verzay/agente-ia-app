
import { Button } from "@/components/ui/button"
import { Pencil, Trash2 } from "lucide-react"
import { openEditDialog, openDeleteDialog } from '@/stores';
import { Reminders } from "@prisma/client";

export const ReminderActions = ({ reminder }: { reminder: Reminders }) => {
    return (
        <div className="flex items-center gap-1 shrink-0">
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Editar"
                onClick={() => openEditDialog(reminder.id, reminder)}
            >
                <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Eliminar"
                onClick={() => openDeleteDialog(reminder.id)}
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    )
}
