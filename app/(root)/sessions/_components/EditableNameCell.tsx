"use client";

import { useState } from "react";
import { PencilLine } from "lucide-react";
import { toast } from "sonner";

import { updateLeadPushNameAction } from "@/actions/registro-action";
import { ContactEditDialog } from "@/app/(root)/chats/_components/ContactEditDialog";
import type { Session } from "@/types/session";

export function EditableNameCell({
    session,
    onUpdated,
}: {
    session: Session;
    onUpdated: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const [isPending, setIsPending] = useState(false);

    const name = session.pushName || "Sin nombre";
    const phone = session.remoteJid?.split("@")[0];

    const handleOpen = () => {
        setDraft(session.pushName || "");
        setOpen(true);
    };

    const handleSave = async () => {
        const normalized = draft.trim();
        if (!normalized) return;
        setIsPending(true);
        try {
            const result = await updateLeadPushNameAction({
                sessionId: session.id,
                pushName: normalized,
            });
            if (!result.success) {
                toast.error(result.message || "No se pudo actualizar el nombre.");
                return;
            }
            toast.success("Nombre actualizado.");
            onUpdated();
            setOpen(false);
        } finally {
            setIsPending(false);
        }
    };

    return (
        <div className="group flex max-w-[150px] items-center gap-1">
            <span className="truncate">{name}</span>
            <button
                type="button"
                onClick={handleOpen}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                title="Editar nombre"
            >
                <PencilLine className="h-3.5 w-3.5" />
            </button>
            <ContactEditDialog
                open={open}
                onOpenChange={setOpen}
                currentName={name}
                phoneLabel={phone}
                draft={draft}
                onDraftChange={setDraft}
                onSave={handleSave}
                isPending={isPending}
            />
        </div>
    );
}
