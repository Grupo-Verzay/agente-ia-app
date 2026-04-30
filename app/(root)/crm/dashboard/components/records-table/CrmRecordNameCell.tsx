"use client";

import { useState } from "react";
import { PencilLine } from "lucide-react";
import { toast } from "sonner";

import { updateLeadPushNameAction } from "@/actions/registro-action";
import { ContactEditDialog } from "@/app/(root)/chats/_components/ContactEditDialog";
import { getDisplayNombreFromRegistro } from "../../helpers";
import type { RegistroWithSession } from "@/types/session";

export function CrmRecordNameCell({
    registro,
    onUpdated,
}: {
    registro: RegistroWithSession;
    onUpdated?: () => Promise<void> | void;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const [isPending, setIsPending] = useState(false);

    const name = getDisplayNombreFromRegistro(registro);
    const phone = registro.session.remoteJid?.split("@")[0];
    const sessionName = registro.session.pushName;
    const showSessionName =
        !!sessionName &&
        sessionName.trim() !== "" &&
        sessionName.trim() !== name.trim();

    const handleOpen = () => {
        setDraft(registro.session.pushName || registro.nombre || "");
        setOpen(true);
    };

    const handleSave = async () => {
        const normalized = draft.trim();
        if (!normalized) return;
        setIsPending(true);
        try {
            const result = await updateLeadPushNameAction({
                sessionId: registro.session.id,
                pushName: normalized,
            });
            if (!result.success) {
                toast.error(result.message || "No se pudo actualizar el nombre.");
                return;
            }
            toast.success("Nombre actualizado.");
            await onUpdated?.();
            setOpen(false);
        } finally {
            setIsPending(false);
        }
    };

    return (
        <div className="group max-w-[120px]">
            <div className="flex items-center gap-1">
                <span className="truncate font-medium">{name}</span>
                <button
                    type="button"
                    onClick={handleOpen}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    title="Editar nombre"
                >
                    <PencilLine className="h-3.5 w-3.5" />
                </button>
            </div>
            {showSessionName ? (
                <p className="text-xs text-muted-foreground">
                    Sesión: {sessionName}
                </p>
            ) : null}
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
