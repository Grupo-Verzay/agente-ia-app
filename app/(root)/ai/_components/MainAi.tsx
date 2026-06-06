// app/(root)/ai/_components/MainAi.tsx
"use client";

import { ChangeEvent, useCallback, useMemo, useRef, useState } from "react";
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
import { ArrowLeft, ArrowRight, Bot, History, MoreVertical, Trash2 } from "lucide-react";
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
import { AgentPromptChatDialog } from "./AgentPromptChatDialog";
import { TYPE_AI_LABELS, type AiSectionKey } from "./ai-section-labels";

const CADENA_PHASES: Record<keyof typeof TYPE_AI_LABELS, string> = {
    business:   "Base transversal · Datos del negocio y contexto del agente",
    training:   "Fase 1 · Conexión — Saludo, presentación y apertura",
    faq:        "Fases 2-3 · Averiguación + Diagnóstico — Calificación secuencial",
    products:   "Fase 4 · Exposición — Catálogo, precios y propuesta de valor",
    more:       "Fase 5 · Negociación — Objeciones, Q&A y casos especiales",
    management: "Fases 6-7 · Acuerdo + Postventa — Cierre, herramientas y seguimiento",
};

type TabKey = AiSectionKey;

export const MainAi = ({ flows, user, promptMeta, sections }: MainAiProps) => {
    const router = useRouter();
    const [showAlertDialog, setShowAlertDialog] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
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
        maps: sections?.business?.maps ?? "",
        telefono: sections?.business?.telefono ?? "",
        email: sections?.business?.email ?? "",
        sitio: sections?.business?.sitio ?? "",
        facebook: sections?.business?.facebook ?? "",
        instagram: sections?.business?.instagram ?? "",
        tiktok: sections?.business?.tiktok ?? "",
        youtube: sections?.business?.youtube ?? "",
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
    const scrollRef = useRef<HTMLDivElement>(null);
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
            sections?.business?.maps, sections?.business?.telefono,
            sections?.business?.email, sections?.business?.sitio,
            sections?.business?.facebook, sections?.business?.instagram,
            sections?.business?.tiktok, sections?.business?.youtube,
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
                    <div className="flex items-center justify-between gap-2 px-2 py-2">
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
                                "flex items-center overflow-x-auto gap-2 pb-1 scrollbar-none",
                                "sm:overflow-visible sm:justify-start sm:flex-wrap"
                            )}
                        >
                            <TooltipProvider delayDuration={400}>
                            {(Object.keys(TYPE_AI_LABELS) as TabKey[]).map((key) => (
                                <Tooltip key={key}>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={() => handleTabClick(key)}
                                            className={cn(
                                                "px-4 py-2 rounded-t-md font-medium text-sm border-b-2 transition-colors duration-150 whitespace-nowrap",
                                                activeTab === key
                                                    ? "border-primary text-primary"
                                                    : "border-transparent text-muted-foreground hover:text-foreground"
                                            )}
                                            aria-pressed={activeTab === key}
                                            aria-label={`Cambiar a ${TYPE_AI_LABELS[key]}`}
                                        >
                                            <span className="flex items-center gap-1.5">
                                                {TYPE_AI_LABELS[key]}
                                                {tabCounts[key] > 0 && (
                                                    <span className="text-[10px] font-semibold leading-none bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
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
                                            maps: serverSections.business?.maps ?? prev.maps,
                                            telefono: serverSections.business?.telefono ?? prev.telefono,
                                            email: serverSections.business?.email ?? prev.email,
                                            sitio: serverSections.business?.sitio ?? prev.sitio,
                                            facebook: serverSections.business?.facebook ?? prev.facebook,
                                            instagram:
                                                serverSections.business?.instagram ?? prev.instagram,
                                            tiktok: serverSections.business?.tiktok ?? prev.tiktok,
                                            youtube: serverSections.business?.youtube ?? prev.youtube,
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
                                className="gap-2 h-9"
                                onClick={() => setShowPromptChat(true)}
                            >
                                <Bot className="h-4 w-4 text-primary" />
                                <span className="hidden sm:inline">IA Prompts</span>
                            </Button>

<DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" aria-label="Open menu" size="icon">
                                        <MoreVertical />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-48" align="end">
                                    <DropdownMenuGroup>
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
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => scroll("right")}
                            className="sm:hidden"
                            aria-label="Desplazar pestanas a la derecha"
                        >
                            <ArrowRight />
                        </Button>
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
                                        maps: business.maps ?? prev.maps,
                                        telefono: business.telefono ?? prev.telefono,
                                        email: business.email ?? prev.email,
                                        sitio: business.sitio ?? prev.sitio,
                                        facebook: business.facebook ?? prev.facebook,
                                        instagram: business.instagram ?? prev.instagram,
                                        tiktok: business.tiktok ?? prev.tiktok,
                                        youtube: business.youtube ?? prev.youtube,
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
                                    firmaEnabled: sections?.extras?.firmaEnabled ?? false,
                                    firmaText: sections?.extras?.firmaText ?? undefined,
                                    firmaName: sections?.extras?.firmaName ?? undefined,
                                }}
                                firmaEnabled={firmaEnabled}
                                signatureName={signatureName}
                                onFirmaEnabledChange={setFirmaEnabled}
                                onSignatureNameChange={setSignatureName}
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
                onApplyDraft={activeTab !== "business" ? (text) => setValues((prev) => ({ ...prev, [activeTab]: text })) : undefined}
                businessName={promptMeta.businessName ?? ""}
            />
        </>
    );
};
