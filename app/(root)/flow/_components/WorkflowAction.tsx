"use client"

import { useState } from "react";
import { usePathname } from "next/navigation";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import TooltipWrapper from "@/components/TooltipWrapper";
import { Button, buttonVariants } from "@/components/ui/button";
import { MoreVerticalIcon, ShuffleIcon, TrashIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { GenericDeleteDialog } from "@/components/shared/GenericDeleteDialog";
import { deleteEntireWorkflow } from "@/actions/workflow-actions";

export const WorkflowAction = ({ workflowId, userId }: { workflowId: string; userId: string }) => {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const pathname = usePathname();
    const segments = pathname.split("/").filter(Boolean);

    const isWorkflowModule = segments.includes("workflow") || segments.includes("workflows");
    const basePrefix = pathname.startsWith("/dashboard") ? "/dashboard" : "";
    const editorHref = `${basePrefix}/${isWorkflowModule ? "workflow" : "flow"}/${workflowId}`;

    return (
        <div className="flex flex-row gap-2">
            {showDeleteDialog && workflowId && (
                <GenericDeleteDialog
                    open={showDeleteDialog}
                    setOpen={setShowDeleteDialog}
                    itemId={workflowId}
                    mutationFn={() => deleteEntireWorkflow(userId, workflowId)}
                    entityLabel="Flujo"
                />
            )}

            <Link
                href={editorHref}
                className={cn(
                    buttonVariants({
                        variant: "outline",
                        size: "sm",
                    }),
                    "flex items-center gap-2"
                )}
            >
                <ShuffleIcon size={16} />
                Ingresar/Editar
            </Link>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant={"outline"} size={"sm"}>
                        <TooltipWrapper content={"Mas Acciones"}>
                            <div className="flex items-center justify-center w-full h-full">
                                <MoreVerticalIcon size={18} />
                            </div>
                        </TooltipWrapper>
                    </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="text-destructive flex items items-center gap-2"
                        onSelect={() => setShowDeleteDialog((prev) => !prev)}
                    >
                        <TrashIcon size={16} />
                        Eliminar
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};