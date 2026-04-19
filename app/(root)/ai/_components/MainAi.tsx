// app/(root)/ai/_components/MainAi.tsx
"use client";

import { ChangeEvent, useCallback, useMemo, useRef, useState } from "react";
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
import { ArrowLeft, ArrowRight, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
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

export const TYPE_AI_LABELS = {
    business: "Perfil",
    training: "Inicio",
    faq: "Preguntas",
    products: "Productos",
    more: "Extras",
    management: "Gestion",
} as const;

type TabKey = keyof typeof TYPE_AI_LABELS;

export const MainAi = ({ flows, user, promptMeta, sections }: MainAiProps) => {
    const [showAlertDialog, setShowAlertDialog] = useState(false);

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

    const prompt = useMemo(() => buildPrompt(values), [values]);

    return (
        <>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)} className="w-full">
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
                                "flex overflow-x-auto gap-2 pb-1 scrollbar-none",
                                "sm:overflow-visible sm:justify-start sm:flex-wrap"
                            )}
                        >
                            {(Object.keys(TYPE_AI_LABELS) as TabKey[]).map((key) => (
                                <button
                                    key={key}
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
                                    {TYPE_AI_LABELS[key]}
                                </button>
                            ))}
                            <PromptToolbar
                                    promptId={promptMeta.id}
                                    version={promptVersion}
                                    userId={user.id}
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

                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" aria-label="Open menu" size="icon">
                                        <MoreVertical />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-40" align="end">
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem onSelect={() => setShowAlertDialog(true)}>
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
                </div>

                <div className="flex flex-row w-full gap-2 max-h-[78vh]">
                    <div className="flex flex-1 flex-col min-h-0 overflow-y-auto pr-1">
                        <TabsContent value="business" className="m-0">
                            <BusinessPromptBuilder
                                user={user}
                                values={values}
                                handleChange={handleChange}
                                promptId={promptMeta.id}
                                version={promptVersion}
                                onVersionChange={setPromptVersion}
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
                                initialSteps={sections?.training?.steps ?? []}
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
                                initialItems={sections?.faq?.steps ?? []}
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
                                initialItems={sections?.products?.steps ?? []}
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
                itemId={user.id}
                mutationFn={() => deleteAgentPromptsByUserId(user.id)}
                entityLabel="todo el auto prompt"
            />
        </>
    );
};
