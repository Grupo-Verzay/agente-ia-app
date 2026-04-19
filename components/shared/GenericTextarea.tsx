import { MessageSquareIcon } from "lucide-react";
import { Textarea } from "../ui/textarea";
import { ChangeEvent } from "react";

interface genericTextarea {
    isEditing: boolean
    isPending: boolean
    fileType: string
    message: string
    handleSave: () => void
    setIsEditing: (isEditing: boolean) => void
    setMessage: (e: ChangeEvent<HTMLTextAreaElement>) => void
}

export const GenericTextarea = ({ isEditing, message, handleSave, setIsEditing, setMessage, isPending, fileType }: genericTextarea) => {

    return (
        <>
            {
                isEditing ? (
                    <Textarea
                        value={message}
                        onChange={setMessage}
                        onBlur={handleSave}
                        rows={3}
                        autoFocus
                        disabled={isPending}
                        className="w-full p-3 border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-y min-h-[120px]"
                    />
                ) : (
                    <div
                        className="w-full flex items-start cursor-pointer hover:bg-muted/50 border border-muted-foreground/20 rounded-lg bg-muted transition-all p-2"
                        onClick={() => setIsEditing(true)}
                    >
                        <span className="text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                            {message || <span className="text-muted-foreground/50 ">Agregar mensaje...</span>}
                        </span>
                    </div>
                )
            }
        </>
    )
}
