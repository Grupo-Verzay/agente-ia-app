import { SystemMessage, TypePromptAi } from "@prisma/client";
import { SubmitHandler } from "react-hook-form";
import { z } from "zod";

export const TYPE_AI_LABELS: Record<TypePromptAi, string> = {
    [TypePromptAi.TRAINING]: 'Prompt padre',
    [TypePromptAi.FAQs]: 'Prompt asistente IA',
    [TypePromptAi.ACTIONS]: 'Acciones',
    [TypePromptAi.DATA_CAPTURE]: 'Captura de datos',
    [TypePromptAi.DATA_QUERY]: 'Consulta de Datos|',
};

export const PromptAiSchema = z.object({
    id: z.string().optional(),
    title: z.string().min(1, 'El título es obligatorio'),
    message: z.string().min(1, 'La descripción es obligatoria'),
    userId: z.string().min(1, 'El usuario es obligatorio'),
    typePrompt: z.nativeEnum(TypePromptAi),
});
export interface FormPromptAiProps {
    promptAi: SystemMessage[] | null
    userId: string
    paymentReceiptPrompt?: {
        id: string;
        version: number;
        promptText: string;
    } | null
};
export interface AiCreatePromptProps {
    userId: string
    dialogOpen: boolean
    editingId: string | null
    setDialogOpen: (open: boolean) => void
    defaultValues?: Partial<PromptAiFormValues>;
    openCreateDialog: () => void
};
export interface AiFormInterface {
    onSubmit: SubmitHandler<PromptAiFormValues>;
    defaultValues?: Partial<PromptAiFormValues>;
}
export interface PromptTabsProps {
    messages: SystemMessage[]
    debouncedSearchTerm?: string
    highlightMatch: (text: string, search: string) => React.ReactNode
    truncateMessage: (text: string, length: number) => string
    openEditDialog: (msg: SystemMessage) => void
};

export type PromptAiFormValues = z.infer<typeof PromptAiSchema>

// 1. Esquema de validación (Zod)
export const PromptInstanciaSchema = z.object({
    // 'id' es opcional porque no estará presente al crear un nuevo prompt
    id: z.number().int().optional(),

    // 'userId' es obligatorio
    userId: z.string().min(1, "El ID del usuario es obligatorio."),

    // 'instanceType', 'description', y 'content' son opcionales
    instanceType: z.string().optional(),
    description: z.string().optional(),
    content: z.string().min(1, "El content del prompt no puede estar vacío.").optional(),

    // 'instanciaId' es opcional y puede ser nulo
    instanciaId: z.number().int().optional(),
});

// 2. Tipo de dato de TypeScript (derivado del esquema)
export type PromptInstanciaFormValues = z.infer<typeof PromptInstanciaSchema>;
