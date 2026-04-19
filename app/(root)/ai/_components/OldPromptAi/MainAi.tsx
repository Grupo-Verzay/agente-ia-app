"use client";

import { useState } from "react";
import { FormPromptAiProps, PromptAiFormValues } from "@/schema/ai";
import { SystemMessage, TypePromptAi } from "@prisma/client";
import { useDebounce } from "@/hooks/useDebounce";
import Header from "@/components/shared/header";
import { Input } from "@/components/ui/input";
import { AiTabs, MessageTabs, PromptDialog } from "./";
import { PaymentReceiptPromptBuilder } from "../PaymentReceiptPromptBuilder";
import { GenericDeleteDialog } from "@/components/shared/GenericDeleteDialog";
import { deletePromptAi, deletePromptAiByUserId } from "@/actions/ai-actions";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Ellipsis } from "lucide-react";
import { AGENT_PROMPT_IDS } from "@/lib/agent-prompt-ids";

const PAYMENT_RECEIPT_TAB = "ANALYZER";

export function formatPromptByType(promptAi: any[], type: string) {
    const filtered = (promptAi ?? []).filter((m) => m.typePrompt === type);
    return formatPromptArray(filtered);
}

export function formatPromptArray(data: any): string {
    if (!Array.isArray(data)) {
        throw new Error("El parametro recibido no es un array valido.");
    }

    let result = "";

    data.forEach((item) => {
        const title = typeof item.title === "string" ? item.title.trim() : "Sin titulo";
        const message = typeof item.message === "string" ? item.message.trim() : "";
        result += `${title}\n${message}\n\n`;
    });

    return result.trim();
}

export const MainAi = ({ promptAi, userId, paymentReceiptPrompt }: FormPromptAiProps) => {
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [dialogOpen, setDialogOpen] = useState<boolean>(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
    const [delTraining, setDelTraining] = useState<boolean>(false);
    const [editingData, setEditingData] = useState<PromptAiFormValues | null>(null);
    const [dataDelete, setDataDelete] = useState<PromptAiFormValues | null>(null);
    const [activeTab, setActiveTab] = useState<string>(TypePromptAi.TRAINING);

    const trainingPromptFormatted = formatPromptByType(promptAi ?? [], "TRAINING");
    const faqsPromptFormatted = formatPromptByType(promptAi ?? [], "FAQs");
    const paymentReceiptPromptFormatted = paymentReceiptPrompt?.promptText?.trim() ?? "";

    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    const openCreateDialog = () => {
        if (activeTab === PAYMENT_RECEIPT_TAB) return;

        setEditingData({
            title: "",
            message: "",
            userId,
            typePrompt: "TRAINING",
        });
        setDialogOpen(true);
    };

    const openEditDialog = (msg: SystemMessage) => {
        setEditingData({
            id: msg.id,
            message: msg.message,
            title: msg.title,
            typePrompt: msg.typePrompt ?? "TRAINING",
            userId: msg.userId,
        });
        setDialogOpen(true);
    };

    const filteredMessages = (promptAi ?? []).filter((msg) => {
        const lowerSearch = debouncedSearchTerm.toLowerCase();
        return (
            msg.title?.toLowerCase().includes(lowerSearch) ||
            msg.message?.toLowerCase().includes(lowerSearch)
        );
    });

    const highlightMatch = (text: string, query: string) => {
        if (!query) return text;
        const parts = text.split(new RegExp(`(${query})`, "gi"));
        return parts.map((part, i) =>
            part.toLowerCase() === query.toLowerCase() ? (
                <span key={i} className="bg-yellow-200 font-semibold">
                    {part}
                </span>
            ) : (
                part
            )
        );
    };

    const truncateMessage = (text: string, maxLength: number) => {
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength) + "... Ver mas";
    };

    const onTabChange = (tab: string) => {
        setActiveTab(tab);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="sticky top-0 z-1 mb-4">
                <div className="flex justify-between items-center pb-2">
                    <Header title={"Entrena tu IA"} />

                    <button
                        onClick={openCreateDialog}
                        disabled={activeTab === PAYMENT_RECEIPT_TAB}
                        className="bg-primary text-white px-4 py-2 rounded-md disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        Crear
                    </button>
                </div>

                {activeTab !== PAYMENT_RECEIPT_TAB && (
                    <Input
                        placeholder="Buscar mensaje por titulo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="max-w-sm mb-2"
                    />
                )}

                <div className="flex flex-1 ">
                    <AiTabs
                        onTabChange={onTabChange}
                        promptsByTab={{
                            TRAINING: trainingPromptFormatted,
                            FAQs: faqsPromptFormatted,
                            ANALYZER: paymentReceiptPromptFormatted,
                        }}
                    />

                    {activeTab !== PAYMENT_RECEIPT_TAB && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost">
                                    <Ellipsis />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setDelTraining(true)}>
                                    Eliminar entrenamiento
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {activeTab === PAYMENT_RECEIPT_TAB ? (
                    <PaymentReceiptPromptBuilder
                        userId={userId}
                        agentId={AGENT_PROMPT_IDS.paymentReceiptAnalyzer}
                        title="Analizador de comprobantes"
                        description="Administra el prompt especializado para analizar comprobantes de pago."
                        initialPromptText={paymentReceiptPrompt?.promptText ?? ""}
                        initialExists={!!paymentReceiptPrompt}
                        showInlineSaveButton
                    />
                ) : (
                    <MessageTabs
                        messages={filteredMessages}
                        debouncedSearchTerm={debouncedSearchTerm}
                        highlightMatch={highlightMatch}
                        truncateMessage={truncateMessage}
                        openEditDialog={openEditDialog}
                        activeTab={activeTab}
                        setDeleteDialogOpen={setDeleteDialogOpen}
                        setDataDelete={setDataDelete}
                    />
                )}
            </div>

            <PromptDialog
                open={dialogOpen}
                setOpen={setDialogOpen}
                defaultValues={editingData}
                userId={userId}
            />

            {dataDelete && (
                <GenericDeleteDialog
                    open={deleteDialogOpen}
                    setOpen={setDeleteDialogOpen}
                    itemId={dataDelete.id ?? ""}
                    mutationFn={() => deletePromptAi(dataDelete.id ?? "")}
                    entityLabel={dataDelete.title}
                />
            )}

            <GenericDeleteDialog
                open={delTraining}
                setOpen={setDelTraining}
                itemName="Entrenamiento IA"
                itemId={userId}
                mutationFn={() => deletePromptAiByUserId(userId)}
                entityLabel="Todo el entrenamiento IA"
            />
        </div>
    );
};
