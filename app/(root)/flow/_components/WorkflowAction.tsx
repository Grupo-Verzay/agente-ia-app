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
import { HomeIcon, ListOrderedIcon, MoreVerticalIcon, ShuffleIcon, TrashIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { GenericDeleteDialog } from "@/components/shared/GenericDeleteDialog";
import { deleteEntireWorkflow, toggleFunnelStep } from "@/actions/workflow-actions";

export const WorkflowAction = ({
    workflowId,
    userId,
    isWelcome,
    onSetAsWelcome,
    isFunnelStep,
    onToggleFunnel,
}: {
    workflowId: string;
    userId: string;
    isWelcome?: boolean;
    onSetAsWelcome?: () => void;
    isFunnelStep?: boolean;
    onToggleFunnel?: () => void;
}) => {
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
                Editar
            </Link>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant={"outline"} size={"sm"} className="w-9 px-0">
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
                    {onToggleFunnel && (
                        <DropdownMenuItem
                            className="flex items-center gap-2"
                            onSelect={onToggleFunnel}
                        >
                            <ListOrderedIcon size={16} className={isFunnelStep ? "text-muted-foreground" : "text-blue-600"} />
                            {isFunnelStep ? "Quitar del embudo" : "Paso de embudo"}
                        </DropdownMenuItem>
                    )}
                    {onSetAsWelcome && (
                        <DropdownMenuItem
                            className="flex items-center gap-2"
                            onSelect={onSetAsWelcome}
                        >
                            {isWelcome ? (
                                <>
                                    <XCircleIcon size={16} className="text-muted-foreground" />
                                    Quitar
                                </>
                            ) : (
                                <>
                                    <HomeIcon size={16} className="text-green-600" />
                                    Bienvenida
                                </>
                            )}
                        </DropdownMenuItem>
                    )}
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
