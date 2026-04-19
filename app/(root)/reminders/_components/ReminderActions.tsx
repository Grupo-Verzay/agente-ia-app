
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EditIcon, MoreHorizontal, Trash2Icon } from "lucide-react"
import { openEditDialog, openDeleteDialog } from '@/stores';
import { Reminders } from "@prisma/client";

export const ReminderActions = ({ reminder }: { reminder: Reminders }) => {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost">
                    <span className="sr-only">Abrir menú</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuItem
                        // className="text-blue-600"
                        onClick={() => openEditDialog(reminder.id, reminder)}
                    >
                        Editar
                        <DropdownMenuShortcut>
                            <EditIcon />
                        </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        // className="text-red-600"
                        onClick={() => openDeleteDialog(reminder.id)}
                    >
                        Eliminar
                        <DropdownMenuShortcut>
                            <Trash2Icon />
                        </DropdownMenuShortcut>
                    </DropdownMenuItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
