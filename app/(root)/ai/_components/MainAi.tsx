// app/(root)/ai/_components/MainAi.tsx
"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { BusinessPromptBuilder, ExtraInfoBuilder, FqaBuilder, PromptPreview, TrainingBuilder } from "./";
import { buildPrompt } from "./helpers";
import {
    BusinessValues,
    ExtrasDraftSchema,
    FaqDraftSchema,
    initialValues,
    MainAiProps,
    ManagementDraftSchema,
    ProductsDraftSchema,
    TrainingDraftSchema,
} from "@/types/agentAi";
import { ProductBuilder } from "./ProductBuilder";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, BarChart2, Bot, History, Layers, MoreVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PromptToolbar } from "./PromptToolbar";
import {
    buildExtrasMarkdown,
    buildFaqMarkdown,
    buildManagementMarkdown,
    buildProductsMarkdown,
    buildTrainingMarkdown,
} from "./helpers/actionsBuilders";
import { ManagementBuilder } from "./ManagementBuilder";
import { KeywordsBuilder } from "./KeywordsBuilder";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GenericDeleteDialog } from "@/components/shared/GenericDeleteDialog";
import { deleteAgentPromptsByUserId } from "@/actions/prompt-actions";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import { AgentMetricsPanel } from "./AgentMetricsPanel";
import { TemplatePickerSheet } from "./TemplatePickerSheet";
import { applyTemplateToPrompt } from "@/actions/apply-template-action";
import { toast } from "sonner";
import { AgentPromptChatDialog } from "./AgentPromptChatDialog";
import { TYPE_AI_LABELS, type AiSectionKey } from "./ai-section-labels";

const CADENA_PHASES: Record<keyof typeof TYPE_AI_LABELS, string> = {
    business:   "Base transversal · Datos del negocio y contexto del agente",
    training:   "Fase 1 · Conexión — Saludo, presentación y apertura",
    faq:        "Fases 2-3 · Averiguación + Diagnóstico — Calificación secuencial",
    products:   "Fase 4 · Exposición — Catálogo, precios y propuesta de valor",
    more:       "Fase 5 · Negociación — Objeciones, Q&A y casos especiales",
    keywords:   "Atajos directos — Respuestas sin IA · palabras clave frecuentes o urgentes",
    management: "Fases 6-7 · Acuerdo + Postventa — Cierre, herramientas y seguimiento",
};

type TabKey = AiSectionKey;

export const MainAi = ({ flows, user, promptMeta, sections }: MainAiProps) => {
    const router = useRouter();
    const [showAlertDialog, setShowAlertDialog] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showMetrics, setShowMetrics] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [showPromptChat, setShowPromptChat] = useState(false);

    const trainingMd = sections?.training
        ? buildTrainingMarkdown(TrainingDraftSchema.parse(sections.training))
        : "";
    const faqMd = sections?.faq
        ? buildFaqMarkdown(FaqDraftSchema.parse(sections.faq))
        : "";
    const productsMd = sections?.products
        ? buildProductsMarkdown(ProductsDraftSchema.parse(sections.products))
        : "";
    const extrasMd = sections?.extras
        ? buildExtrasMarkdown(ExtrasDraftSchema.parse(sections.extras))
        : "";
    const managementMd = sections?.management
        ? buildManagementMarkdown(ManagementDraftSchema.parse(sections.management))
        : "";

    const hydrated: BusinessValues = {
        nombre: sections?.business?.nombre ?? "",
        sector: sections?.business?.sector ?? "",
        ubicacion: sections?.business?.ubicacion ?? "",
        horarios: sections?.business?.horarios ?? "",
        telefono: sections?.business?.telefono ?? "",
        email: sections?.business?.email ?? "",
        sitio: sections?.business?.sitio ?? "",
        facebook: sections?.business?.facebook ?? "",
        instagram: sections?.business?.instagram ?? "",
        tiktok: sections?.business?.tiktok ?? "",
        youtube: sections?.business?.youtube ?? "",
        linkedin: sections?.business?.linkedin ?? "",
        twitter: sections?.business?.twitter ?? "",
        telegram: sections?.business?.telegram ?? "",
        notas: sections?.business?.notas ?? "",
        training: trainingMd,
        faq: faqMd,
        products: productsMd,
        more: extrasMd,
        management: managementMd,
    };

    const [values, setValues] = useState<BusinessValues>({ ...initialValues, ...hydrated });
    const [activeTab, setActiveTab] = useState<TabKey>("business");

    // Firma state (lifted from ExtraInfoBuilder so UI lives in Perfil)
    const _initialFirmaText = sections?.extras?.firmaText ?? "";
    const _firmaMatch = _initialFirmaText.match(/@([a-zA-Z0-9_]+)/);
    const _initialSignatureName = _firmaMatch ? _firmaMatch[1] : sections?.extras?.firmaName ?? "";
    const [signatureName, setSignatureName] = useState<string>(_initialSignatureName);
    const [firmaEnabled, setFirmaEnabled] = useState<boolean>(_initialSignatureName.trim().length > 0);
    const [promptVersion, setPromptVersion] = useState<number>(promptMeta.version);
    const [emptyStateDismissed, setEmptyStateDismissed] = useState(false);
    const [applyingChip, setApplyingChip] = useState<string | null>(null);
    const [, startChipTransition] = useTransition();
    const scrollRef = useRef<HTMLDivElement>(null);

    // Chips de plantillas con conteo dinámico según ancho del contenedor
    const ALL_TEMPLATE_CHIPS = [
        { label: "Venta Directa",        emoji: "⚡", color: "bg-rose-500/10 text-rose-600 border-rose-200 hover:bg-rose-500/20",     templateId: "venta-directa"      },
        { label: "Venta Consultiva",      emoji: "🎯", color: "bg-indigo-500/10 text-indigo-600 border-indigo-200 hover:bg-indigo-500/20", templateId: "venta-consultiva"   },
        { label: "Agendamiento citas",    emoji: "📅", color: "bg-teal-500/10 text-teal-600 border-teal-200 hover:bg-teal-500/20",     templateId: "agendamiento-citas" },
        { label: "Calificación leads",    emoji: "🧲", color: "bg-amber-500/10 text-amber-600 border-amber-200 hover:bg-amber-500/20", templateId: "calificacion-leads" },
        { label: "Atención/soporte",      emoji: "🎧", color: "bg-cyan-500/10 text-cyan-600 border-cyan-200 hover:bg-cyan-500/20",     templateId: "atencion-cliente"   },
        { label: "Toma pedidos/delivery", emoji: "🛵", color: "bg-orange-500/10 text-orange-600 border-orange-200 hover:bg-orange-500/20", templateId: "pedidos-delivery"   },
    ];

    const handleChipApply = (templateId: string, chipLabel: string) => {
        if (!templateId || applyingChip) return;
        setApplyingChip(chipLabel);
        startChipTransition(async () => {
            const res = await applyTemplateToPrompt({ promptId: promptMeta.id, templateId });
            if (res.ok) {
                toast.success(
                    res.flowsCreated && res.flowsCreated > 0
                        ? `Plantilla aplicada — ${res.flowsCreated} flujo(s) creado(s)`
                        : "Plantilla aplicada correctamente"
                );
                router.refresh();
            } else {
                toast.error(res.error ?? "No se pudo aplicar la plantilla");
            }
            setApplyingChip(null);
        });
    };
    const chipsContainerRef = useRef<HTMLDivElement>(null);
    const [visibleChipCount, setVisibleChipCount] = useState(ALL_TEMPLATE_CHIPS.length);

    useEffect(() => {
        const el = chipsContainerRef.current;
        if (!el) return;

        // Mide el ancho del chip con Canvas (px-2 = 16px padding + 2px border)
        const measureChipW = (text: string): number => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) return text.length * 7 + 18;
            ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
            return Math.ceil(ctx.measureText(text).width) + 18;
        };

        const chipWidths = ALL_TEMPLATE_CHIPS.map((c) => measureChipW(c.emoji + " " + c.label));
        const moreW = measureChipW("+9 más") + 16; // buffer extra para que el botón "+más" nunca se corte

        const measure = () => {
            const available = el.clientWidth;
            let total = 0;
            let count = 0;
            for (let i = 0; i < ALL_TEMPLATE_CHIPS.length; i++) {
                const isArrayLast = i === ALL_TEMPLATE_CHIPS.length - 1;
                const needed = total + chipWidths[i] + (isArrayLast ? 0 : moreW);
                if (needed > available) break;
                total += chipWidths[i];
                count++;
            }
            // Canvas subestima ~10% vs render real; si todos caben con poco margen, mostrar N-2 + "+más"
            if (count === ALL_TEMPLATE_CHIPS.length && total > available * 0.90) {
                count -= 2;
            }
            setVisibleChipCount(Math.max(1, count));
        };

        const obs = new ResizeObserver(measure);
        obs.observe(el);
        measure();
        return () => obs.disconnect();
    }, []);

    const isEmpty =
        !emptyStateDismissed &&
        (sections?.training?.steps ?? []).length === 0 &&
        (sections?.faq?.steps ?? []).length === 0 &&
        (sections?.products?.steps ?? []).length === 0 &&
        (sections?.management?.steps ?? []).length === 0;
    const saveHandlersRef = useRef<Record<string, () => Promise<void>>>({});

    const registerSaveHandler = useCallback((key: string, handler: () => Promise<void>) => {
        saveHandlersRef.current[key] = handler;
    }, []);

    const handleManualSaveCurrent = useCallback(async () => {
        const handler = saveHandlersRef.current[activeTab];
        if (!handler) return;
        await handler();
    }, [activeTab]);

    const handleChange = useCallback(
        (key: keyof BusinessValues) =>
            (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                setValues((v) => ({ ...v, [key]: e.target.value }));
            },
        []
    );

    const handleTabClick = (key: TabKey) => setActiveTab(key);

    const scroll = (direction: "left" | "right") => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollBy({
            left: direction === "left" ? -150 : 150,
            behavior: "smooth",
        });
    };

    const prompt = useMemo(
        () => buildPrompt(values, { enabled: firmaEnabled, name: signatureName }),
        [values, firmaEnabled, signatureName]
    );

    const estimatedTokens = useMemo(() => Math.ceil(prompt.length / 4), [prompt]);

    const currentDraft = useMemo(() => {
        if (activeTab === "business") {
            return [
                values.nombre && `Nombre: ${values.nombre}`,
                values.sector && `Sector: ${values.sector}`,
                values.ubicacion && `Ubicacion: ${values.ubicacion}`,
                values.horarios && `Horarios: ${values.horarios}`,
                values.telefono && `Telefono: ${values.telefono}`,
                values.email && `Email: ${values.email}`,
                values.sitio && `Sitio web: ${values.sitio}`,
                values.notas && `Notas: ${values.notas}`,
            ].filter(Boolean).join("\n");
        }

        const map: Record<Exclude<TabKey, "business">, keyof BusinessValues> = {
            training: "training",
            faq: "faq",
            products: "products",
            more: "more",
            management: "management",
        };

        return String(values[map[activeTab as Exclude<TabKey, "business">]] ?? "");
    }, [activeTab, values]);

    const completedTabs = useMemo((): Set<TabKey> => {
        const done = new Set<TabKey>();
        if (values.nombre?.trim() || values.sector?.trim()) done.add("business");
        if (values.training?.trim()) done.add("training");
        if (values.faq?.trim()) done.add("faq");
        if (values.products?.trim()) done.add("products");
        if (values.more?.trim()) done.add("more");
        if (values.management?.trim()) done.add("management");
        return done;
    }, [values]);

    const tabCounts = useMemo((): Record<TabKey, number> => {
        const businessFields = [
            sections?.business?.nombre, sections?.business?.sector,
            sections?.business?.ubicacion, sections?.business?.horarios,
            sections?.business?.telefono, sections?.business?.email,
            sections?.business?.sitio, sections?.business?.facebook,
            sections?.business?.instagram, sections?.business?.tiktok,
            sections?.business?.youtube, sections?.business?.linkedin,
            sections?.business?.twitter, sections?.business?.telegram,
            sections?.business?.notas,
        ];
        return {
            business: businessFields.filter((f) => f?.trim()).length,
            training: sections?.training?.steps?.length ?? 0,
            faq: sections?.faq?.steps?.length ?? 0,
            products: sections?.products?.steps?.length ?? 0,
            more: sections?.extras?.steps?.length ?? 0,
            management: sections?.management?.steps?.length ?? 0,
        };
    }, [sections]);

    const completionCount = completedTabs.size;
    const totalTabs = Object.keys(TYPE_AI_LABELS).length;

    return (
        <>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)} className="w-full flex flex-col flex-1 min-h-0">
                <div className="sticky w-full top-0 z-10 -mx-4 lg:mx-0 bg-slate-100 dark:bg-black">
                    <div className="flex items-center justify-between gap-2 py-2 pl-2 pr-0.5">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => scroll("left")}
                            className="sm:hidden"
                            aria-label="Desplazar pestanas a la izquierda"
                        >
                            <ArrowLeft />
                        </Button>
                        <div
                            ref={scrollRef}
                            className={cn(
                                "flex flex-1 min-w-0 items-center overflow-x-auto gap-0 pb-1 scrollbar-none"
                            )}
                        >
                            <TooltipProvider delayDuration={400}>
                            {(Object.keys(TYPE_AI_LABELS) as TabKey[]).map((key) => (
                                <Tooltip key={key}>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={() => handleTabClick(key)}
                                            className={cn(
                                                "px-2.5 py-1.5 rounded-t-md font-medium text-sm border-b-2 transition-colors duration-150 whitespace-nowrap",
                                                activeTab === key
                                                    ? "border-primary text-primary"
                                                    : "border-transparent text-muted-foreground hover:text-foreground"
                                            )}
                                            aria-pressed={activeTab === key}
                                            aria-label={`Cambiar a ${TYPE_AI_LABELS[key]}`}
                                        >
                                            <span className="flex items-center gap-1">
                                                {TYPE_AI_LABELS[key]}
                                                {tabCounts[key] > 0 && (
                                                    <span className="text-[10px] font-semibold leading-none bg-muted text-muted-foreground rounded-full px-1 py-0.5 min-w-[16px] text-center">
                                                        {tabCounts[key]}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-[260px] text-center text-xs">
                                        {CADENA_PHASES[key]}
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                            </TooltipProvider>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => scroll("right")}
                            className="sm:hidden shrink-0"
                            aria-label="Desplazar pestanas a la derecha"
                        >
                            <ArrowRight />
                        </Button>
                        <div className="flex items-center gap-2 shrink-0">
                            <PromptToolbar
                                    promptId={promptMeta.id}
                                    version={promptVersion}
                                    userId={user.effectiveId ?? user.id}
                                    onVersionChange={setPromptVersion}
                                    onConflict={(serverState) => {
                                        const serverSections = serverState?.sections;
                                        if (!serverSections) {
                                            if (serverState?.version) setPromptVersion(serverState.version);
                                            return;
                                        }

                                        const nextTrainingMd = serverSections.training
                                            ? buildTrainingMarkdown(
                                                TrainingDraftSchema.parse(serverSections.training)
                                            )
                                            : "";
                                        const nextFaqMd = serverSections.faq
                                            ? buildFaqMarkdown(FaqDraftSchema.parse(serverSections.faq))
                                            : "";
                                        const nextProductsMd = serverSections.products
                                            ? buildProductsMarkdown(
                                                ProductsDraftSchema.parse(serverSections.products)
                                            )
                                            : "";
                                        const nextExtrasMd = serverSections.extras
                                            ? buildExtrasMarkdown(
                                                ExtrasDraftSchema.parse(serverSections.extras)
                                            )
                                            : "";
                                        const nextManagementMd = serverSections.management
                                            ? buildManagementMarkdown(
                                                ManagementDraftSchema.parse(serverSections.management)
                                            )
                                            : "";

                                        setValues((prev) => ({
                                            ...prev,
                                            nombre: serverSections.business?.nombre ?? prev.nombre,
                                            sector: serverSections.business?.sector ?? prev.sector,
                                            ubicacion: serverSections.business?.ubicacion ?? prev.ubicacion,
                                            horarios: serverSections.business?.horarios ?? prev.horarios,
                                            telefono: serverSections.business?.telefono ?? prev.telefono,
                                            email: serverSections.business?.email ?? prev.email,
                                            sitio: serverSections.business?.sitio ?? prev.sitio,
                                            facebook: serverSections.business?.facebook ?? prev.facebook,
                                            instagram:
                                                serverSections.business?.instagram ?? prev.instagram,
                                            tiktok: serverSections.business?.tiktok ?? prev.tiktok,
                                            youtube: serverSections.business?.youtube ?? prev.youtube,
                                            linkedin: serverSections.business?.linkedin ?? prev.linkedin,
                                            twitter: serverSections.business?.twitter ?? prev.twitter,
                                            telegram: serverSections.business?.telegram ?? prev.telegram,
                                            notas: serverSections.business?.notas ?? prev.notas,
                                            training: nextTrainingMd,
                                            faq: nextFaqMd,
                                            products: nextProductsMd,
                                            more: nextExtrasMd,
                                            management: nextManagementMd,
                                        }));

                                        if (serverState?.version) {
                                            setPromptVersion(serverState.version);
                                        }
                                    }}
                                    revalidatePath="/ia"
                                    revisions={[]}
                                    onManualSave={handleManualSaveCurrent}
                                />

                            <Button
                                variant="outline"
                                className="gap-2 h-9 bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 hover:text-primary hover:border-primary/50"
                                onClick={() => setShowPromptChat(true)}
                            >
                                <Bot className="h-4 w-4" />
                                <span className="hidden sm:inline">IA Prompts</span>
                            </Button>

                            <span
                                title={`~${estimatedTokens.toLocaleString()} tokens estimados del prompt completo`}
                                className={[
                                    "hidden sm:inline-flex items-center h-9 rounded-md border px-3 text-xs font-medium tabular-nums select-none cursor-default",
                                    estimatedTokens < 5000
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                                        : estimatedTokens < 10000
                                        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400"
                                        : "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-400",
                                ].join(" ")}
                            >
                                ~{estimatedTokens.toLocaleString()} tk
                            </span>

<DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" aria-label="Open menu" size="icon">
                                        <MoreVertical />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-48" align="end">
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem onSelect={() => setShowTemplates(true)}>
                                            <Layers className="mr-2 h-4 w-4" />
                                            Plantillas por objetivo
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => setShowMetrics(true)}>
                                            <BarChart2 className="mr-2 h-4 w-4" />
                                            Métricas del agente
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => setShowHistory(true)}>
                                            <History className="mr-2 h-4 w-4" />
                                            Historial de versiones
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => setShowAlertDialog(true)} className="text-destructive focus:text-destructive">
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Eliminar todo
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            </div>
                    </div>
                    {/* Barra de progreso global */}
                    <div className="px-3 pb-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                style={{ width: `${(completionCount / totalTabs) * 100}%` }}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                            {completionCount}/{totalTabs}
                        </span>
                    </div>
                </div>

                <div className="flex flex-row w-full gap-2 flex-1 min-h-0">
                    <div className="flex flex-1 flex-col min-h-0 overflow-y-auto pr-1">

                        {/* Empty state: ofrecer plantilla cuando el agente no tiene contenido */}
                        {isEmpty && (
                            <div className="rounded-xl border bg-muted/30 px-4 py-3 mb-3">
                                {/* Fila 1: ícono + título + botones */}
                                <div className="flex items-center gap-3 flex-nowrap">
                                    <span className="text-3xl shrink-0">🤖</span>
                                    <p className="text-sm font-semibold leading-tight flex-1 min-w-0 truncate">¡Configura tu Agente IA!</p>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setShowTemplates(true)}
                                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                                        >
                                            Elegir plantilla
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEmptyStateDismissed(true)}
                                            className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                                        >
                                            Desde cero
                                        </button>
                                    </div>
                                </div>
                                {/* Fila 2: descripción + chips */}
                                <div className="mt-1.5">
                                    <p className="text-xs text-muted-foreground pl-10">
                                        Elige una plantilla por objetivo, o construye desde cero.
                                    </p>
                                    <div ref={chipsContainerRef} className="flex flex-nowrap justify-between mt-1.5 overflow-hidden">
                                        {ALL_TEMPLATE_CHIPS.slice(0, visibleChipCount).map((c) => (
                                            <button
                                                key={c.templateId}
                                                type="button"
                                                disabled={!!applyingChip}
                                                onClick={() => handleChipApply(c.templateId, c.label)}
                                                className={cn(
                                                    "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed",
                                                    c.color
                                                )}
                                            >
                                                {applyingChip === c.label ? "..." : `${c.emoji} ${c.label}`}
                                            </button>
                                        ))}
                                        {visibleChipCount < ALL_TEMPLATE_CHIPS.length && (
                                            <button
                                                type="button"
                                                onClick={() => setShowTemplates(true)}
                                                className="rounded-full border border-dashed bg-background px-2 py-0.5 text-[10px] text-muted-foreground/70 hover:border-primary hover:text-primary transition-colors shrink-0"
                                            >
                                                +{ALL_TEMPLATE_CHIPS.length - visibleChipCount} más
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <TabsContent value="business" className="m-0">
                            <BusinessPromptBuilder
                                user={user}
                                values={values}
                                handleChange={handleChange}
                                promptId={promptMeta.id}
                                version={promptVersion}
                                onVersionChange={setPromptVersion}
                                firmaEnabled={firmaEnabled}
                                signatureName={signatureName}
                                onFirmaEnabledChange={setFirmaEnabled}
                                onSignatureNameChange={setSignatureName}
                                onConflict={(serverState) => {
                                    const business = serverState?.sections?.business ?? {};
                                    setValues((prev) => ({
                                        ...prev,
                                        nombre: business.nombre ?? prev.nombre,
                                        sector: business.sector ?? prev.sector,
                                        ubicacion: business.ubicacion ?? prev.ubicacion,
                                        horarios: business.horarios ?? prev.horarios,
                                        telefono: business.telefono ?? prev.telefono,
                                        email: business.email ?? prev.email,
                                        sitio: business.sitio ?? prev.sitio,
                                        facebook: business.facebook ?? prev.facebook,
                                        instagram: business.instagram ?? prev.instagram,
                                        tiktok: business.tiktok ?? prev.tiktok,
                                        youtube: business.youtube ?? prev.youtube,
                                        linkedin: business.linkedin ?? prev.linkedin,
                                        twitter: business.twitter ?? prev.twitter,
                                        telegram: business.telegram ?? prev.telegram,
                                        notas: business.notas ?? prev.notas,
                                    }));
                                    if (serverState?.version) setPromptVersion(serverState.version);
                                }}
                                registerSaveHandler={(fn) => registerSaveHandler("business", fn)}
                            />
                        </TabsContent>

                        <TabsContent value="training" className="m-0">
                            <TrainingBuilder
                                flows={flows}
                                values={{ training: values.training ?? "" }}
                                handleChange={handleChange}
                                notificationNumber={user.notificationNumber}
                                promptId={promptMeta.id}
                                version={promptVersion}
                                onVersionChange={setPromptVersion}
                                onConflict={() => {
                                    setValues((prev) => ({ ...prev, training: prev.training }));
                                }}
                                initialSteps={sections?.training?.steps}
                                registerSaveHandler={(fn) => registerSaveHandler("training", fn)}
                            />
                        </TabsContent>

                        <TabsContent value="faq" className="m-0">
                            <FqaBuilder
                                flows={flows}
                                values={{ faq: values.faq ?? "" }}
                                handleChange={handleChange}
                                notificationNumber={user.notificationNumber}
                                promptId={promptMeta.id}
                                version={promptVersion}
                                onVersionChange={setPromptVersion}
                                onConflict={() => {
                                    setValues((prev) => ({ ...prev, faq: prev.faq }));
                                }}
                                initialItems={sections?.faq?.steps}
                                registerSaveHandler={(fn) => registerSaveHandler("faq", fn)}
                            />
                        </TabsContent>

                        <TabsContent value="products" className="m-0">
                            <ProductBuilder
                                flows={flows}
                                values={{ products: values.products ?? "" }}
                                handleChange={handleChange}
                                notificationNumber={user.notificationNumber}
                                promptId={promptMeta.id}
                                version={promptVersion}
                                onVersionChange={setPromptVersion}
                                onConflict={() => {
                                    setValues((prev) => ({ ...prev, products: prev.products }));
                                }}
                                initialItems={sections?.products?.steps}
                                registerSaveHandler={(fn) => registerSaveHandler("products", fn)}
                            />
                        </TabsContent>

                        <TabsContent value="more" className="m-0">
                            <ExtraInfoBuilder
                                flows={flows}
                                values={{ more: values.more ?? "" }}
                                handleChange={handleChange}
                                notificationNumber={user.notificationNumber}
                                promptId={promptMeta.id}
                                version={promptVersion}
                                onVersionChange={setPromptVersion}
                                onConflict={() => {
                                    setValues((prev) => ({ ...prev, more: prev.more }));
                                }}
                                initialExtras={{
                                    items: sections?.extras?.steps ?? [],
                                }}
                                registerSaveHandler={(fn) => registerSaveHandler("more", fn)}
                            />
                        </TabsContent>

                        <TabsContent value="management" className="m-0">
                            <ManagementBuilder
                                flows={flows}
                                values={{ management: values.management ?? "" }}
                                handleChange={handleChange}
                                notificationNumber={user.notificationNumber}
                                promptId={promptMeta.id}
                                version={promptVersion}
                                onVersionChange={setPromptVersion}
                                onConflict={() => {
                                }}
                                initialItems={sections?.management?.steps ?? []}
                                registerSaveHandler={(fn) => registerSaveHandler("management", fn)}
                            />
                        </TabsContent>

                        <TabsContent value="keywords" className="m-0">
                            <KeywordsBuilder
                                promptId={promptMeta.id}
                                version={promptVersion}
                                onVersionChange={setPromptVersion}
                                onConflict={() => {}}
                                initialRules={sections?.keywords?.rules ?? []}
                                registerSaveHandler={(fn) => registerSaveHandler("keywords", fn)}
                            />
                        </TabsContent>

                        <div className="h-6" />
                    </div>

                    <aside className="hidden lg:block lg:w-[420px]">
                        <PromptPreview prompt={prompt} />
                    </aside>
                </div>
            </Tabs>

            <GenericDeleteDialog
                open={showAlertDialog}
                setOpen={setShowAlertDialog}
                itemName="auto prompt"
                itemId={user.effectiveId ?? user.id}
                mutationFn={() => deleteAgentPromptsByUserId(user.effectiveId ?? user.id)}
                entityLabel="todo el auto prompt"
            />

            <TemplatePickerSheet
                open={showTemplates}
                onOpenChange={setShowTemplates}
                promptId={promptMeta.id}
                hasContent={!isEmpty}
                onApplied={() => { setEmptyStateDismissed(false); router.refresh(); }}
            />

            <AgentMetricsPanel open={showMetrics} onOpenChange={setShowMetrics} />

            <VersionHistoryPanel
                open={showHistory}
                onOpenChange={setShowHistory}
                promptId={promptMeta.id}
                currentVersion={promptVersion}
                onRestored={() => { setShowHistory(false); router.refresh(); }}
            />
            <AgentPromptChatDialog
                open={showPromptChat}
                onOpenChange={setShowPromptChat}
                activeTab={activeTab}
                currentDraft={currentDraft}
                promptPreview={prompt}
                promptId={promptMeta.id}
                promptVersion={promptVersion}
                onApplyDraft={activeTab !== "business" ? (text) => setValues((prev) => ({ ...prev, [activeTab]: text })) : undefined}
                businessName={promptMeta.businessName ?? ""}
            />
        </>
    );
};
