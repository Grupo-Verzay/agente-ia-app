"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { upsertAgentPromptText } from "@/actions/system-prompt-actions";
import { FreeformAgentPromptBuilderProps } from "@/types/agentAi";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function PaymentReceiptPromptBuilder({
    userId,
    agentId,
    title,
    description,
    initialPromptText = "",
    initialExists = false,
    registerSaveHandler,
    showInlineSaveButton = false,
}: FreeformAgentPromptBuilderProps) {
    const [promptText, setPromptText] = useState(initialPromptText);
    const [hasCustomPrompt, setHasCustomPrompt] = useState(initialExists);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

    useEffect(() => {
        setPromptText(initialPromptText);
        setHasCustomPrompt(initialExists);
        setSaveStatus("idle");
    }, [initialExists, initialPromptText]);

    const handleSave = useCallback(async () => {
        setSaveStatus("saving");

        const result = await upsertAgentPromptText({
            userId,
            agentId,
            promptText,
        });

        if (!result.ok) {
            setSaveStatus("error");
            throw new Error(result.error);
        }

        setHasCustomPrompt(result.data.mode !== "deleted" && result.data.mode !== "noop");
        setSaveStatus("saved");
    }, [agentId, promptText, userId]);

    useEffect(() => {
        registerSaveHandler?.(handleSave);
    }, [handleSave, registerSaveHandler]);

    useEffect(() => {
        if (saveStatus !== "saved") return;

        const timer = setTimeout(() => setSaveStatus("idle"), 1500);
        return () => clearTimeout(timer);
    }, [saveStatus]);

    return (
        <Card className="border-muted/60">
            <CardHeader className="pb-2 flex items-center justify-between gap-2 flex-row">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{title}</CardTitle>
                    <Badge variant={hasCustomPrompt ? "default" : "secondary"}>
                        {hasCustomPrompt ? "Personalizado" : "Fallback backend"}
                    </Badge>
                    {saveStatus !== "idle" && (
                        <span
                            className={
                                "text-xs " +
                                (saveStatus === "saving"
                                    ? "text-muted-foreground"
                                    : saveStatus === "saved"
                                        ? "text-emerald-500"
                                        : "text-destructive")
                            }
                        >
                            {saveStatus === "saving" && "Guardando..."}
                            {saveStatus === "saved" && "Cambios guardados"}
                            {saveStatus === "error" && "Error al guardar"}
                        </span>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                    {description ??
                        "Configura de forma independiente como la IA interpreta comprobantes de pago."}
                </p>
                <Textarea
                    value={promptText}
                    onChange={(event) => setPromptText(event.target.value)}
                    placeholder="Escribe aqui el prompt del analizador de comprobantes..."
                    className="min-h-[340px] resize-y"
                />
                <p className="text-xs text-muted-foreground">
                    Si lo dejas vacio y guardas, se elimina la personalizacion y el backend vuelve
                    a usar su fallback por defecto.
                </p>
                {showInlineSaveButton && (
                    <div className="flex justify-end">
                        <Button
                            type="button"
                            onClick={() => {
                                void handleSave().catch(() => undefined);
                            }}
                            disabled={saveStatus === "saving"}
                        >
                            {saveStatus === "saving" ? "Guardando..." : "Guardar prompt"}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
