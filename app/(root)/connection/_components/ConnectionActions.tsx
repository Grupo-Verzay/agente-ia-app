"use client"

import { Button } from "@/components/ui/button"
import { Trash2Icon } from "lucide-react";

interface ConnectionActionsInterface {
    handleDelete: () => void;
    handleRename: () => void;
    handlePrompt?: () => void;
}

export const ConnectionActions = ({ handleDelete, handleRename, handlePrompt }: ConnectionActionsInterface) => {
    return (
        <>
            <Button variant={"destructive"}
                onClick={handleDelete}
            >
                <Trash2Icon />
            </Button>
        </>
    )
}
