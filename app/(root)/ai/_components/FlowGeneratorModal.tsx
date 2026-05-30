"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { autoSaveBeforeGenerate, generateFlowSections, applyAllGeneratedSections } from "@/actions/generate-agent-flow";

type Stage =
    | "idle"
    | "saving"
    | "generating"
    | "catalog"
    | "business"
    | "training"
    | "faq"
    | "products"
    | "extras"
    | "management"
    | "done"
    | "error";

const STEPS: { key: Stage; label: string; description: string }[] = [
    { key: "saving",     label: "Respaldo automático",    description: "Guardando versión actual en historial" },
    { key: "generating", label: "Perfil, inicio y FAQ",   description: "GPT-4o genera flujo conversacional y preguntas" },
    { key: "catalog",    label: "Catálogo y gestión",     description: "GPT-4o genera productos, extras y capturas" },
    { key: "business",   label: "Perfil del negocio",     description: "Nombre, sector, datos de contacto" },
    { key: "training",   label: "Flujo de inicio",        description: "Pasos de bienvenida y conversación" },
    { key: "faq",        label: "Preguntas frecuentes",   description: "Respuestas a consultas comunes" },
    { key: "products",   label: "Catálogo de productos",  description: "Servicios, precios y características" },
    { key: "extras",     label: "Información extra",      description: "Despedidas, fuera de horario, firma" },
    { key: "management", label: "Gestión",                description: "Capturas de datos y notificaciones" },
];

const ORDER: Stage[] = STEPS.map((s) => s.key);

function getStepState(stage: Stage, key: Stage): "done" | "active" | "pending" {
    if (stage === "done") return "done";
    const si = ORDER.indexOf(stage);
    const ki = ORDER.indexOf(key);
    if (ki < si) return "done";
    if (ki === si) return "active";
    return "pending";
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    promptId: string;
    version: number;
}

export function FlowGeneratorModal({ open, onOpenChange, promptId, version }: Props) {
    const [description, setDescription] = useState("");
    const [stage, setStage] = useState<Stage>("idle");
    const [error, setError] = useState<string | null>(null);

    const isRunning = stage !== "idle" && stage !== "done" && stage !== "error";
    const showProgress = stage !== "idle";
    const completedCount = stage === "done" ? STEPS.length : Math.max(0, ORDER.indexOf(stage));
    const progressPct = (completedCount / STEPS.length) * 100;

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const handleGenerate = async () => {
        if (!description.trim() || isRunning) return;
        setError(null);

        try {
            // Paso 1: respaldo
            setStage("saving");
            const saved = await autoSaveBeforeGenerate({ promptId });
            if (!saved.ok) throw new Error(saved.error);

            // Paso 2: dos llamadas paralelas a OpenAI
            // "generating" → Llamada A (perfil, inicio, FAQ)
            // "catalog"    → Llamada B (productos, extras, gestión)
            // Ambas corren en paralelo; mostramos "catalog" después de un delay visual
            setStage("generating");
            const genPromise = generateFlowSections({ description });
            await delay(4000); // tiempo visual mínimo antes de mostrar la segunda etapa
            setStage("catalog");
            const gen = await genPromise;
            if (!gen.ok) throw new Error(gen.error);

            // Paso 3: aplicar en DB de forma atómica mientras animamos los pasos
            const applyPromise = applyAllGeneratedSections({ promptId, sections: gen.sections });

            const sectionStages: Stage[] = ["business", "training", "faq", "products", "extras", "management"];
            for (const s of sectionStages) {
                setStage(s);
                await delay(350);
            }

            const result = await applyPromise;
            if (!result.ok) throw new Error(result.error);

            setStage("done");
            setTimeout(() => window.location.reload(), 2000);
        } catch (e: any) {
            setError(e?.message ?? "Error inesperado. Intenta de nuevo.");
            setStage("error");
        }
    };

    const handleOpenChange = (next: boolean) => {
        if (isRunning) return;
        if (!next) { setStage("idle"); setError(null); }
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg h-[585px] flex flex-col overflow-hidden p-0">

                {/* Header */}
                <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Generar flujo con IA
                    </DialogTitle>
                    {!showProgress && (
                        <p className="text-sm text-muted-foreground mt-1">
                            Pega la información de tu negocio: descripción, catálogo, precios, horarios y protocolos. La IA generará el flujo completo.
                        </p>
                    )}
                </DialogHeader>

                {/* Cuerpo */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {!showProgress ? (
                        <textarea
                            className="flex-1 w-full px-6 py-4 text-sm bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground/60"
                            placeholder={`Ejemplo:\nSoy Cursos Javeriano, academia en Barquisimeto. Ofrecemos cursos de mecánica, estética, electricidad y computación.\n\nInscripción: $3 | Clases: $8-10 | Certificado: $7\nPago móvil BNC 0191 · Cédula 20017685\n\nCursos:\n- Barbería: 8 clases | $8/clase\n- Mecánica Diesel: 10 clases | $10/clase\n...`}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            disabled={isRunning}
                        />
                    ) : (
                        <div className="flex-1 flex flex-col px-6 py-4 overflow-hidden">

                            {/* Barra de progreso */}
                            <div className="mb-5 shrink-0">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs text-muted-foreground">
                                        {stage === "done" ? "Completado" : stage === "error" ? "Error" : (stage === "generating" || stage === "catalog") ? "Consultando IA (puede tardar 20-40 seg)…" : "Aplicando…"}
                                    </span>
                                    <span className="text-xs font-medium tabular-nums">
                                        {stage === "done" ? STEPS.length : completedCount}/{STEPS.length}
                                    </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all duration-500",
                                            stage === "error" ? "bg-destructive" : "bg-primary"
                                        )}
                                        style={{ width: `${stage === "done" ? 100 : progressPct}%` }}
                                    />
                                </div>
                            </div>

                            {/* Lista de pasos */}
                            <ul className="space-y-1 flex-1 overflow-y-auto">
                                {STEPS.map(({ key, label, description: desc }) => {
                                    const state = getStepState(stage, key);
                                    const isError = stage === "error" && ORDER.indexOf(key) === ORDER.indexOf(stage);

                                    return (
                                        <li
                                            key={key}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                                                state === "active" && "bg-primary/5 border border-primary/20",
                                                state === "done" && "opacity-60",
                                                state === "pending" && "opacity-40",
                                            )}
                                        >
                                            {/* Icono */}
                                            <span className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full border transition-colors"
                                                style={{
                                                    borderColor: state === "active" ? "hsl(var(--primary))" :
                                                                 state === "done" ? "hsl(142 76% 36%)" : "hsl(var(--border))",
                                                    background:  state === "active" ? "hsl(var(--primary)/0.08)" :
                                                                 state === "done" ? "hsl(142 76% 36% / 0.1)" : "transparent",
                                                }}
                                            >
                                                {state === "done" ? (
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                ) : state === "active" ? (
                                                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                                                ) : (
                                                    <Circle className="h-4 w-4 text-muted-foreground/30" />
                                                )}
                                            </span>

                                            {/* Texto */}
                                            <div className="min-w-0">
                                                <p className={cn(
                                                    "text-sm leading-none",
                                                    state === "active" ? "font-semibold text-foreground" :
                                                    state === "done"   ? "font-medium" : "font-normal"
                                                )}>
                                                    {label}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{desc}</p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>

                            {/* Mensajes finales */}
                            {stage === "done" && (
                                <div className="mt-3 shrink-0 flex items-center gap-2 text-sm text-emerald-600 font-medium">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    ¡Listo! Versión anterior guardada en historial. Recargando…
                                </div>
                            )}
                            {stage === "error" && error && (
                                <div className="mt-3 shrink-0 flex items-start gap-2 text-sm text-destructive">
                                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                    {error}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <DialogFooter className="px-6 pb-5 pt-3 border-t shrink-0 gap-2">
                    {stage !== "done" && (
                        <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isRunning}>
                            Cancelar
                        </Button>
                    )}
                    {(stage === "idle") && (
                        <Button onClick={handleGenerate} disabled={!description.trim()}>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Generar
                        </Button>
                    )}
                    {stage === "error" && (
                        <Button onClick={() => { setStage("idle"); setError(null); }}>
                            Intentar de nuevo
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
