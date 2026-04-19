import { UserWithApiKeys } from "@/schema/schema";
import { Workflow } from "@prisma/client";
import { ChangeEvent } from "react";
import z from "zod";


export const SUBTYPE_OPTIONS = ["Solicitudes", "Pedidos", "Reservas", "Reclamos", "Citas"] as const;

export type DataSubtype = (typeof SUBTYPE_OPTIONS)[number];

export type CapturaDatosCardProps = PropsDataCapture & {
    /** Opcional: si lo pasas, actualiza el subtipo en el padre */
    onSubtypeChange: (subtype: DataSubtype) => void;
};

/* =========================
   0) Zod Schemas (payloads)
========================= */

export const SectionKeySchema = z.enum(['business', 'training', 'faq', 'products', 'extras', 'management']);

/* ---------- DRAFT (para edición/autosave) ---------- */
export const BusinessDraftSchema = z.object({
    nombre: z.string().optional().default(""),
    sector: z.string().optional().default(""),
    ubicacion: z.string().optional().default(""),
    horarios: z.string().optional().default(""),
    maps: z.string().optional().default(""),
    telefono: z.string().optional().default(""),
    email: z.string().optional().default(""),
    sitio: z.string().optional().default(""),
    facebook: z.string().optional().default(""),
    instagram: z.string().optional().default(""),
    tiktok: z.string().optional().default(""),
    youtube: z.string().optional().default(""),
    notas: z.string().optional().default(""),
});

export const TrainingDraftSchema = z.object({
    steps: z.array(
        z.object({
            id: z.string(),
            title: z.string().optional(),
            mainMessage: z.string().optional().default(""),
            elements: z.array(
                z.union([
                    z.object({
                        id: z.string(),
                        kind: z.literal("text"),
                        text: z.string().optional().default(""),
                    }),
                    z.object({
                        id: z.string(),
                        kind: z.literal("function"),
                        fn: z.enum([
                            "captura_datos",
                            "ejecutar_flujo",
                            "notificar_asesor",
                            "consulta_datos",
                            "actualizar_datos",
                        ]),
                        // ⬇️ refuerza el enum como en el type
                        subtype: z
                            .enum(["Solicitudes", "Reclamos", "Pedidos", "Reservas", "Citas"])
                            .optional(),
                        prompt: z.string().optional(),
                        fields: z.array(z.string()).optional(),

                        // ⬇️ acepta null | string (coincide con tus types)
                        flowId: z.string().nullable().optional(),
                        flowName: z.string().nullable().optional(),
                        notificationNumber: z.string().nullable().optional(),
                    }),
                ])
            ).default([]),
        })
    ).default([]),
});

export const FaqDraftSchema = z.object({
    steps: z.array(
        z.object({
            id: z.string(),
            title: z.string().optional(),
            mainMessage: z.string().optional().default(""),
            elements: z.array(
                z.union([
                    z.object({
                        id: z.string(),
                        kind: z.literal("text"),
                        text: z.string().optional().default(""),
                    }),
                    z.object({
                        id: z.string(),
                        kind: z.literal("function"),
                        fn: z.enum([
                            "captura_datos",
                            "ejecutar_flujo",
                            "notificar_asesor",
                            "consulta_datos",
                            "actualizar_datos",
                        ]),
                        // ⬇️ refuerza el enum como en el type
                        subtype: z
                            .enum(["Solicitudes", "Reclamos", "Pedidos", "Reservas", "Citas"])
                            .optional(),
                        prompt: z.string().optional(),
                        fields: z.array(z.string()).optional(),

                        // ⬇️ acepta null | string (coincide con tus types)
                        flowId: z.string().nullable().optional(),
                        flowName: z.string().nullable().optional(),
                        notificationNumber: z.string().nullable().optional(),
                    }),
                ])
            ).default([]),
        })
    ).default([]),
});

export const ProductsDraftSchema = z.object({
    steps: z.array(
        z.object({
            id: z.string(),
            title: z.string().optional(),
            mainMessage: z.string().optional().default(""),
            elements: z.array(
                z.union([
                    z.object({
                        id: z.string(),
                        kind: z.literal("text"),
                        text: z.string().optional().default(""),
                    }),
                    z.object({
                        id: z.string(),
                        kind: z.literal("function"),
                        fn: z.enum([
                            "captura_datos",
                            "ejecutar_flujo",
                            "notificar_asesor",
                            "consulta_datos",
                            "actualizar_datos",
                        ]),
                        // ⬇️ refuerza el enum como en el type
                        subtype: z
                            .enum(["Solicitudes", "Reclamos", "Pedidos", "Reservas", "Citas"])
                            .optional(),
                        prompt: z.string().optional(),
                        fields: z.array(z.string()).optional(),

                        // ⬇️ acepta null | string (coincide con tus types)
                        flowId: z.string().nullable().optional(),
                        flowName: z.string().nullable().optional(),
                        notificationNumber: z.string().nullable().optional(),
                    }),
                ])
            ).default([]),
        })
    ).default([]),
});

export const ExtrasDraftSchema = z.object({
    firmaEnabled: z.boolean().optional().default(false),
    firmaText: z.string().optional().default(""),
    firmaName: z.string().optional().default(""),
    steps: z.array(
        z.object({
            id: z.string(),
            title: z.string().optional(),
            mainMessage: z.string().optional().default(""),
            elements: z.array(
                z.union([
                    z.object({
                        id: z.string(),
                        kind: z.literal("text"),
                        text: z.string().optional().default(""),
                    }),
                    z.object({
                        id: z.string(),
                        kind: z.literal("function"),
                        fn: z.enum([
                            "captura_datos",
                            "ejecutar_flujo",
                            "notificar_asesor",
                            "consulta_datos",
                            "actualizar_datos",
                        ]),
                        // ⬇️ refuerza el enum como en el type
                        subtype: z
                            .enum(["Solicitudes", "Reclamos", "Pedidos", "Reservas", "Citas"])
                            .optional(),
                        prompt: z.string().optional(),
                        fields: z.array(z.string()).optional(),

                        // ⬇️ acepta null | string (coincide con tus types)
                        flowId: z.string().nullable().optional(),
                        flowName: z.string().nullable().optional(),
                        notificationNumber: z.string().nullable().optional(),
                    }),
                ])
            ).default([]),
        })
    ).default([]),
});

export const ManagementDraftSchema = z.object({
    steps: z.array(
        z.object({
            id: z.string(),
            title: z.string().optional(),
            mainMessage: z.string().optional().default(""),
            elements: z.array(
                z.union([
                    z.object({
                        id: z.string(),
                        kind: z.literal("text"),
                        text: z.string().optional().default(""),
                    }),
                    z.object({
                        id: z.string(),
                        kind: z.literal("function"),
                        fn: z.enum([
                            "captura_datos",
                            "ejecutar_flujo",
                            "notificar_asesor",
                            "consulta_datos",
                            "actualizar_datos",
                        ]),
                        // ⬇️ refuerza el enum como en el type
                        subtype: z
                            .enum(["Solicitudes", "Reclamos", "Pedidos", "Reservas", "Citas"])
                            .optional(),
                        prompt: z.string().optional(),
                        fields: z.array(z.string()).optional(),

                        // ⬇️ acepta null | string (coincide con tus types)
                        flowId: z.string().nullable().optional(),
                        flowName: z.string().nullable().optional(),
                        notificationNumber: z.string().nullable().optional(),
                    }),
                ])
            ).default([]),
        })
    ).default([]),
});


export const SectionsDraftSchema = z.object({
    business: BusinessDraftSchema,
    training: TrainingDraftSchema,
    faq: FaqDraftSchema,
    products: ProductsDraftSchema,
    extras: ExtrasDraftSchema,
    management: ManagementDraftSchema,
});

/* ---------- STRICT (para publicar/validación fuerte) ---------- */
export const BusinessStrictSchema = z.object({
    nombre: z.string().min(1, 'nombre requerido'),
    sector: z.string().optional(),
    ubicacion: z.string().optional(),
    horarios: z.string().optional(),
    maps: z.string().optional(),
    telefono: z.string().optional(),
    email: z.string().optional(),
    sitio: z.string().optional(),
    facebook: z.string().optional(),
    instagram: z.string().optional(),
    tiktok: z.string().optional(),
    youtube: z.string().optional(),
    notas: z.string().optional(),
});

export const TrainingStrictSchema = TrainingDraftSchema;
export const FaqStrictSchema = FaqDraftSchema;
export const ProductsStrictSchema = ProductsDraftSchema;
export const ExtrasStrictSchema = ExtrasDraftSchema;
export const ManagementStrictSchema = ManagementDraftSchema;

export const SectionsStrictSchema = z.object({
    business: BusinessStrictSchema,
    training: TrainingStrictSchema,
    faq: FaqStrictSchema,
    products: ProductsStrictSchema,
    extras: ExtrasStrictSchema,
    management: ManagementStrictSchema,
});

/* ---------- Schemas de acciones ---------- */
export const PatchSectionSchema = z.object({
    promptId: z.string().uuid(),
    // promptId: z.string().min(1, "promptId requerido"),
    version: z.number().int().positive(),
    sectionKey: SectionKeySchema,
    patch: z.any(), // Se valida contra los DraftSchemas según la sección en la action
});

export const SaveSchema = z.object({
    promptId: z.string().uuid(),
    version: z.number().int().positive(),
    revalidate: z.string().optional(), // ruta opcional para revalidatePath
});

// OJO: publishedBy es String (cuid), NO uuid
export const PublishSchema = z.object({
    promptId: z.string().uuid(),
    version: z.number().int().positive(),
    publishedBy: z.string(),
    note: z.string().optional(),
    revalidate: z.string().optional(),
});

export const RevertSchema = z.object({
    promptId: z.string().uuid(),
    revisionNumber: z.number().int().nonnegative(),
    revalidate: z.string().optional(),
});

/* ---------------------- Validación ligera UI (React Hook Form) ---------------------- */
export const promptSchema = z.object({
    nombre: z.string().min(1, "Requerido"),
    sector: z.string().optional().default(""),
    ubicacion: z.string().optional().default(""),
    horarios: z.string().optional().default(""),
    maps: z.string().url("URL inválida").or(z.string().length(0)).optional(),
    telefono: z.string().optional().default(""),
    email: z.string().email("Email inválido").or(z.string().length(0)).optional(),
    sitio: z.string().url("URL inválida").or(z.string().length(0)).optional(),
    facebook: z.string().url("URL inválida").or(z.string().length(0)).optional(),
    instagram: z.string().url("URL inválida").or(z.string().length(0)).optional(),
    tiktok: z.string().url("URL inválida").or(z.string().length(0)).optional(),
    youtube: z.string().url("URL inválida").or(z.string().length(0)).optional(),
    notas: z.string().optional().default(""),
});

export type FormValues = z.infer<typeof promptSchema>;

/* ---------------------- Tipos de componentes/props ---------------------- */
export type SectionsPromptSystem = {
    business: {
        nombre: string; sector?: string; ubicacion?: string; horarios?: string;
        maps?: string; telefono?: string; email?: string; sitio?: string;
        facebook?: string; instagram?: string; tiktok?: string; youtube?: string;
        notas?: string;
    };
    training: {
        steps: Array<{
            id: string;
            title?: string;
            mainMessage?: string;
            elements: Array<
                | { id: string; kind: "text"; text: string }
                // | { id: string; kind: "function"; fn: "captura_datos"; subtype?: string; prompt?: string; fields?: string[] }
                | { id: string; kind: "function"; fn: "ejecutar_flujo"; flowId: string; flowName?: string }
                | { id: string; kind: "function"; fn: "notificar_asesor"; notificationNumber: string }
            // | { id: string; kind: "function"; fn: "consulta_datos"; prompt?: string }
            // | { id: string; kind: "function"; fn: "actualizar_datos"; prompt?: string }
            >;
        }>;
    };
    faq: {
        steps: Array<{
            id: string;
            title?: string;
            mainMessage?: string;
            elements: Array<
                | { id: string; kind: "text"; text: string }
                | { id: string; kind: "function"; fn: "ejecutar_flujo"; flowId: string; flowName?: string }
                | { id: string; kind: "function"; fn: "notificar_asesor"; notificationNumber: string }
            >;
        }>;
    };
    products: {
        steps: Array<{
            id: string;
            title?: string;
            mainMessage?: string;
            elements: Array<
                | { id: string; kind: "text"; text: string }
                | { id: string; kind: "function"; fn: "ejecutar_flujo"; flowId: string; flowName?: string }
                | { id: string; kind: "function"; fn: "notificar_asesor"; notificationNumber: string }
            >;
        }>;
    };
    extras: {
        steps: Array<{
            id: string;
            title?: string;
            mainMessage?: string;
            elements: Array<
                | { id: string; kind: "text"; text: string }
                | { id: string; kind: "function"; fn: "ejecutar_flujo"; flowId: string; flowName?: string }
                | { id: string; kind: "function"; fn: "notificar_asesor"; notificationNumber: string }
            >;
        }>;
        firmaName: string;
        firmaEnabled: boolean;
        firmaText: string;
    };
    management: {
        steps?: Array<{
            id: string;
            title?: string;
            mainMessage?: string;
            elements: Array<
                | { id: string; kind: "text"; text: string }
                | { id: string; kind: "function"; fn: "ejecutar_flujo"; flowId: string; flowName?: string }
                | { id: string; kind: "function"; fn: "notificar_asesor"; notificationNumber: string }
            >;
        }>;
        policiesMd?: string;
        slaEnabled?: boolean;
        slaMinutes?: number;
        escalateFlowId?: string | null;
        notifyNumber?: string;
    };
};

export interface MainAiInterface {
    flows: Workflow[];
    user: UserWithApiKeys;
    promptMeta: { id: string; version: number };
    paymentReceiptPrompt?: {
        id: string;
        version: number;
        promptText: string;
    } | null;
}
export type MainAiProps = MainAiInterface & {
    sections: SectionsPromptSystem;
};
export interface BusinessValues {
    nombre: string;
    sector: string;
    ubicacion: string;
    horarios: string;
    maps: string;
    telefono: string;
    email: string;
    sitio: string;
    facebook: string;
    instagram: string;
    tiktok: string;
    youtube: string;
    notas: string;
    training?: string;
    faq?: string;
    products?: string;
    more?: string;
    management?: string;
}

export const initialValues: BusinessValues = {
    nombre: "",
    sector: "",
    ubicacion: "",
    horarios: "",
    maps: "",
    telefono: "",
    email: "",
    sitio: "",
    facebook: "",
    instagram: "",
    tiktok: "",
    youtube: "",
    notas: "",
    training: "",
    faq: "",
    products: "",
    management: "",
};

export interface BusinessBuilderInterface {
    user: UserWithApiKeys;
    values: BusinessValues;
    handleChange: (
        key: keyof BusinessValues
    ) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export type BusinessPromptBuilderProps = BusinessBuilderInterface & {
    promptId: string;
    version: number;
    onVersionChange: (v: number) => void;
    onConflict?: (serverState: any) => void;
    registerSaveHandler?: (fn: () => Promise<void>) => void;
};

export interface PromptPreviewInterface {
    prompt: string;
}

/******** TrainingBuilder **********/
export interface TrainingBuilderProps {
    values: { training: string };
    handleChange: (
        key: "training"
    ) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    flows: Workflow[];
    notificationNumber?: string;
    onChange?: (state: { mainMessage: string; elements: ElementItem[] }) => void;
    promptId: string;
    version: number;
    onVersionChange: (v: number) => void;
    onConflict?: (serverState: any) => void;
    initialSteps?: Array<any>; // steps desde BD (sections.training.steps)
    registerSaveHandler?: (fn: () => Promise<void>) => void;
}

export interface FreeformAgentPromptBuilderProps {
    userId: string;
    agentId: string;
    title: string;
    description?: string;
    initialPromptText?: string;
    initialExists?: boolean;
    registerSaveHandler?: (fn: () => Promise<void>) => void;
    showInlineSaveButton?: boolean;
}

/* -------------------- Tipos locales para PASOS -------------------- */
export type StepTraining = {
    id: string;
    title?: string;
    mainMessage?: string;
    elements: ElementItem[];
    openPicker?: boolean; // UI state por paso
};

export type PedidoFunctionEl = ElementFunction & {
    fn: "captura_datos";
    subtype: "Solicitudes" | "Reclamos" | "Pedidos" | "Reservas" | "Citas";
    prompt: string;
    fields?: string[]; // ← campos adicionales (cc, name, etc.)
};

export type CapturePedidoFunctionEl = ElementFunction & {
    fn: "consulta_datos";
    subtype: "Solicitudes" | "Reclamos" | "Pedidos" | "Reservas" | "Citas";
    prompt: string;
    fields?: string[]; // ← campos adicionales (cc, name, etc.)
};

export type UpdatePedidoFunctionEl = ElementFunction & {
    fn: "actualizar_datos";
    subtype: "Solicitudes" | "Reclamos" | "Pedidos" | "Reservas" | "Citas";
    prompt: string;
    fields?: string[]; // ← campos adicionales (cc, name, etc.)
};

export type ElementText = {
    id: string;
    kind: "text";
    text: string;
};

export type ElementFunction =
    | {
        id: string;
        kind: "function";
        fn: "captura_datos";
        subtype: "Solicitudes" | "Reclamos" | "Pedidos" | "Reservas" | "Citas";
        prompt: string;
    }
    | {
        id: string;
        kind: "function";
        fn: "actualizar_datos";
        subtype: "Solicitudes" | "Reclamos" | "Pedidos" | "Reservas" | "Citas";
        prompt: string;
    }
    | {
        id: string;
        kind: "function";
        fn: "ejecutar_flujo";
        flowId: string | null;
        flowName: string | null;
    }
    | {
        id: string;
        kind: "function";
        fn: "notificar_asesor";
        notificationNumber: string | null;
    }
    | {
        id: string;
        kind: "function";
        fn: "consulta_datos";
        subtype: "Solicitudes" | "Reclamos" | "Pedidos" | "Reservas" | "Citas";
        prompt: string;
    };

export type ElementItem = ElementText | ElementFunction;

export const CAPTURE_SNIPPETS: Record<
    "Solicitudes" | "Reclamos" | "Pedidos" | "Reservas" | "Citas",
    string
> = {
    Solicitudes: "por favor indicame los siguientes datos",
    Reclamos: "por favor indicame los siguientes datos",
    Pedidos: "por favor indicame los siguientes datos",
    Reservas: "por favor indicame los siguientes datos",
    Citas: "URL de agendamiento",
};

export const CONSULTA_DATOS_SNIPPET = `**Consultar Productos**. Si no hay un flujo activo y el usuario pregunta por un producto, ejecuta esta herramienta.
- *Disparadores:* “imagen”, “foto”, “video”, “pdf”, “documento”, “ver”, “ver el producto”, “muéstrame”, “catálogo”.`

/*****************  FQABUILDER ***********************/
export type QaItem = {
    id: string;
    title?: string;
    mainMessage?: string;
    elements: ElementItem[];
    openPicker?: boolean;
}

export const PRESETS: Array<{ title: string; answer: string }> = [
    { title: "Promociones, descuentos y ofertas", answer: "Inserta aquí la respuesta oficial sobre promociones disponibles" },
    { title: "Cliente pide descuento", answer: "Inserta aquí la respuesta para solicitudes de rebaja o promociones individuales" },
    { title: "Me interesa", answer: "Inserta aquí la respuesta para leads interesados que desean avanzar" },
    { title: "¿Cómo se hace la compra?", answer: "Explica brevemente el proceso de compra paso a paso" },
    { title: "Garantía de compra", answer: "Indica condiciones de garantía, cobertura y duración" },
    { title: "Medios de pago", answer: "Describe los métodos de pago aceptados: transferencias, contra entrega, etc." },
    { title: "Tiempo de entrega", answer: "Indica tiempos de envío o entrega por zona o producto" },
    { title: "Dirección, ubicación o tienda", answer: "Indica ubicación física o si es 100% online" },
    { title: "Crédito y/o contra entrega", answer: "Informa si está disponible y bajo qué condiciones" },
    { title: "Requisitos (para crédito o contra entrega)", answer: "Enumera los requisitos mínimos que debe cumplir el cliente para aplicar" },
];

export type FqaBuilderProps = {
    values: { faq: string };
    handleChange: (key: "faq") => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    flows: Workflow[];
    notificationNumber: string;
    onChange?: (state: { mainMessage: string; elements: ElementItem[] }) => void;
    promptId: string;
    version: number;
    onVersionChange: (v: number) => void;
    onConflict?: (serverState: any) => void;
    initialItems?: Array<any>; // ← sections.faq.items desde BD
    registerSaveHandler?: (fn: () => Promise<void>) => void;
};

export type ProductItemType = {
    id: string;
    title?: string;
    mainMessage?: string;
    elements: ElementItem[];
    openPicker?: boolean;
}

export interface ProductBuilderProps {
    values: { products: string }
    handleChange: (key: "products") => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    flows: Workflow[];
    notificationNumber: string;
    onChange?: (state: { mainMessage: string; elements: ElementItem[] }) => void;
    promptId: string;
    version: number;
    onVersionChange: (v: number) => void;
    onConflict?: (serverState: any) => void;
    registerSaveHandler?: (fn: () => Promise<void>) => void;
    initialItems?: Array<any>;
}

export type ExtraItemType = {
    id: string;
    title?: string;
    mainMessage?: string;
    elements: ElementItem[];
    openPicker?: boolean;
}

export interface ExtraInfoBuilderProps {
    values: { more: string };
    handleChange: (
        key: "more"
    ) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    flows: Workflow[];
    notificationNumber: string;
    onChange?: (state: {
        mainMessage: string;
        elements: ElementItem[]
        firmaEnabled: boolean;
        firmaText: string;
        firmaName: string;
        prompt: string;
    }) => void;
    promptId: string;
    version: number;
    onVersionChange: (v: number) => void;
    onConflict?: (serverState: any) => void;
    registerSaveHandler?: (fn: () => Promise<void>) => void;
    initialExtras?: { items?: Array<any>; firmaEnabled?: boolean; firmaText?: string, firmaName?: string };
}

export interface FunctionSelectorInterface {
    step?: any; // existente (bloque destino)
    setSteps?: React.Dispatch<React.SetStateAction<StepTraining[]>>
    notificationNumber: string;
    isManagement?: boolean;
    onCreateBlock?: (el: ElementItem) => void;
}

export type Mode = "faq" | "products" | "extras";

// Props genéricas: el padre controla almacenamiento en BD
export type FnSelector<T> = {
    mode: Mode;
    items: T[];
    addItem: (item: T) => void;
    /** Solo para casos donde quieras actualizar descripción/answer (p.ej. FAQ.a) */
    flows?: Workflow[];
    notificationNumber?: string;
};

export type PropsTextRule = {
    el: ElementText;
    onRemove: () => void;
    onChange: (text: string) => void;
    isManagement?: boolean;
};

export type PropsDataCapture = {
    el: PedidoFunctionEl | (PedidoFunctionEl & { subtype: "Solicitudes" | "Reclamos" | "Reservas" | "Citas" });
    onRemove: () => void;
    onAddField: (field: string) => void;
    onRemoveField: (field: string) => void;
    isManagement?: boolean;
};

type ElExtFlw = {
    id: string;
    kind: "function";
    fn: "ejecutar_flujo";
    flowId?: string;
    flowName?: string;
};

export type PropsExecuteFlow = {
    el: ElExtFlw;
    flows: Array<Workflow>;
    onRemove: () => void;
    onSelectFlow: (flow: Workflow) => void;
    isManagement?: boolean;
};

type El = {
    id: string;
    kind: "function";
    fn: "notificar_asesor";
    notificationNumber?: string;
};

export type PropsConsultaDatos = {
    el: PedidoFunctionEl | (PedidoFunctionEl & { subtype: "Solicitudes" | "Reclamos" | "Reservas" | "Citas" });
    onRemove: () => void;
    onAddField: (field: string) => void;
    onRemoveField: (field: string) => void;
    onSubtypeChange: (subtype: DataSubtype) => void;
    isManagement?: boolean;
};

export type PropsNotifyAsesor = {
    el: El
    onRemove: () => void;
    isManagement?: boolean;
}

export type PropsActionSteeps = {
    stepId: string;
    el: ElementItem;
    flows: Array<Workflow>;
    removeElement: (stepId: string, elId: string) => void;
    updateText: (stepId: string, elId: string, text: string) => void;
    setFlowOnElement: (stepId: string, elId: string, flow: Workflow) => void;
    addPedidoField: (stepId: string, elId: string, field: string) => void;
    removePedidoField: (stepId: string, elId: string, field: string) => void;
    onSubtypeChange: (stepId: string, elId: string, subtype: DataSubtype) => void;
    isManagement?: boolean
};

export type TextElement = {
    id: string;
    kind: "text";
    text?: string;
};

export type FnCommon = {
    id: string;
    kind: "function";
    fn: "captura_datos" | "ejecutar_flujo" | "notificar_asesor" | "consulta_datos" | "actualizar_datos";
    subtype?: "Solicitudes" | "Reclamos" | "Pedidos" | "Reservas" | "Citas";
    prompt?: string;
    fields?: string[];
    flowId?: string | null;
    flowName?: string | null;
    notificationNumber?: string | null;
};

export type AnyElement = TextElement | FnCommon;

export type Step = {
    id: string;
    title?: string;
    mainMessage?: string;
    elements?: AnyElement[];
};

export type DraftLike = {
    steps?: Step[];
    // Solo Extras:
    firmaEnabled?: boolean;
    firmaText?: string;
    firmaName?: string;
};

export type BuildCfg = {
    /** Prefijo del encabezado por sección */
    sectionPrefix?: string; // Ej: "Paso", "Extra", "Producto", "Pregunta"
    /** Separador entre secciones */
    joinSeparator?: string; // default: "\n\n---\n\n"
    /** Texto para comportamiento de ejecutar_flujo */
    flowBehaviorText?: string;
    /** Inyectar bloque de firma al inicio (si hay firma en draft) */
    includeSignature?: boolean; // default: false
    /** Separador entre firma y pasos */
    signatureSeparator?: string; // default: "\n\n---\n\n"
};

export type ManagementItem = {
    id: string;
    title?: string;
    mainMessage?: string;
    elements: ElementItem[];
    openPicker?: boolean;
};

export type ManagementBuilderProps = {
    values: { management: string };
    handleChange: (key: "management") => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    onChange?: (state: { mainMessage: string; elements: ElementItem[] }) => void;
    promptId: string;
    version: number;
    onVersionChange: (v: number) => void;
    onConflict?: (serverState: any) => void;
    initialItems?: Array<any>; // ← sections.faq.items desde BD
    debounceMs?: number;
    flows?: Workflow[];
    registerSaveHandler?: (fn: () => Promise<void>) => void;
    notificationNumber?: string
};

export const flowBehaviorText = `* **Comportamiento obligatorio:** 
  1. Tras ejecutar un flujo, responde **únicamente** lo indicado en **Regla/parámetro**.
  2. Si **no hay una orden clara**, formula una **pregunta contextual** para guiar al usuario al siguiente paso lógico de la conversación. **No añadas texto innecesario.**`
export const notifyPrompt = `**Función**: Ejecuta la tool 'Notificacion Asesor'
* **Comportamiento obligatorio:**
  1. Después de ejecutar la tool, tu única respuesta es la que se te indique en **Regla/parámetro**.
  2. Si **no hay una orden clara**, envía el siguiente **mensaje de confirmación** al usuario:
📝 ¡He *notificado* al area encargada!
👨🏻‍💻 El area encargada se pondrá en contacto contigo a la brevedad posible.`

export type AnyEl = {
    kind: "text" | "function";
    text?: string;
    fn?: "captura_datos" | "ejecutar_flujo" | "notificar_asesor" | "consulta_datos" | "actualizar_datos";
    subtype?: string;
    prompt?: string;
    fields?: string[];
    flowName?: string;
    flowId?: string;
    notificationNumber?: string;

    // NUEVO (opcional): si quieres que “Regla/parámetro” salga al final del bloque gestión
    ruleParam?: string;
};

export type AnyStep = {
    title?: string;
    mainMessage?: string;
    elements?: AnyEl[];
};

export type FirmaOpts = {
    enabled: boolean;
    text: string;
};

export type PromptBuildConfig = {
    /** Mensaje cuando no hay items */
    emptyMessage: string;
    /** Texto del encabezado por sección (recibe índice base 1) */
    sectionLabel: (n: number, step: AnyStep) => string;
    /** Texto del bloque de elementos (recibe índice base 1) */
    elementsLabel: (n: number, step: AnyStep) => string;
    /** Etiqueta del mensaje principal */
    mainMessageLabel: string;
    /** Texto para la explicación de ejecutar_flujo */
    flowBehaviorText?: string;
    /** Separador entre bloques finales */
    joinSeparator?: string;
    /** Opción para anteponer firma */
    firma?: FirmaOpts;
    appointmentUrl?: string;

    // NUEVO: modo especial solo para ManagementBuilder
    mode?: "default" | "management";

    // NUEVO: para imprimir “Gestión X”
    managementName?: string;
    // (opcional) si quieres forzar un objetivo global; si no, usa step.mainMessage
    managementObjective?: string;

    __managementIndex?: number;
};
