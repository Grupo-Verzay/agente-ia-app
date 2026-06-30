"use client"

import { Button } from "@/components/ui/button"
import { RefreshCw, Trash2Icon } from "lucide-react";

interface ConnectionActionsInterface {
    handleDelete: () => void;
    handleRename: () => void;
    handleRecreate?: () => void;
    handlePrompt?: () => void;
}

export const ConnectionActions = ({ handleDelete, handleRename, handleRecreate, handlePrompt }: ConnectionActionsInterface) => {
    return (
        <div className="flex items-center gap-2">
            {handleRecreate && (
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleRecreate}
                    title="Recrear instancia"
                >
                    <RefreshCw className="h-4 w-4" />
                </Button>
            )}
            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={handleDelete} title="Eliminar instancia">
                <Trash2Icon className="h-4 w-4" />
            </Button>
        </div>
    )
}
