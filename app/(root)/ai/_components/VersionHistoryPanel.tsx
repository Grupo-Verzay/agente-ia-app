"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, History, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listPromptRevisions, restoreRevision } from "@/actions/system-prompt-actions";

type Revision = {
    id: string;
    revisionNumber: number;
    publishedAt: Date;
    notes: string | null;
    publishedBy: string;
    sectionsSnapshot: any;
};

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    promptId: string;
    currentVersion: number;
    onRestored: () => void;
}

function extractSummary(snap: any) {
    if (!snap) return null;
    const firma = snap.extras?.firmaName as string | undefined;
    const negocio = snap.business?.nombre as string | undefined;
    const sector = snap.business?.sector as string | undefined;
    const faq = (snap.faq?.steps ?? snap.faq?.items ?? []).length as number;
    const products = (snap.products?.items ?? snap.products?.steps ?? []).length as number;
    const training = (snap.training?.steps ?? snap.training?.items ?? []).length as number;
    const management = (snap.management?.steps ?? snap.management?.items ?? []).length as number;
    const extras = (snap.extras?.steps ?? snap.extras?.items ?? []).length as number;
    return { firma, negocio, sector, faq, products, training, management, extras };
}

export function VersionHistoryPanel({ open, onOpenChange, promptId, onRestored }: Props) {
    const [revisions, setRevisions] = useState<Revision[]>([]);
    const [loading, setLoading] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [restoringId, setRestoringId] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        listPromptRevisions(promptId)
            .then((res) => {
                if (res.ok) setRevisions(res.data as Revision[]);
            })
            .finally(() => setLoading(false));
    }, [open, promptId]);

    const handleRestore = (revisionNumber: number) => {
        setRestoringId(revisionNumber);
        startTransition(async () => {
            const res = await restoreRevision({ promptId, revisionNumber, revalidate: "/ia" });
            if (res.ok) {
                toast.success(`Versión ${revisionNumber} restaurada. Recargando…`);
                onRestored();
            } else {
                toast.error(res.error ?? "No se pudo restaurar");
            }
            setRestoringId(null);
        });
    };

    const formatDate = (date: Date) =>
        new Date(date).toLocaleDateString("es", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-sm flex flex-col p-0">
                <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
                    <SheetTitle className="flex items-center gap-2 text-base">
                        <History className="h-4 w-4" />
                        Historial de versiones
                    </SheetTitle>
                    <p className="text-xs text-muted-foreground">
                        Cada vez que guardas se crea una versión. Puedes restaurar cualquiera.
                    </p>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : revisions.length === 0 ? (
                        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                            Aún no hay versiones guardadas.
                            <br />
                            Usa <span className="font-medium">Guardar</span> para crear la primera.
                        </div>
                    ) : (
                        <ul className="divide-y">
                            {revisions.map((rev, index) => {
                                const isCurrent = index === 0;
                                const isRestoring = restoringId === rev.revisionNumber;
                                const isExpanded = expandedId === rev.id;
                                const summary = isExpanded ? extractSummary(rev.sectionsSnapshot) : null;

                                return (
                                    <li key={rev.id} className="px-4 py-3">
                                        <div className="flex items-start gap-3">
                                            {/* Línea de tiempo */}
                                            <div className="flex flex-col items-center shrink-0 pt-1">
                                                <div className={`h-2 w-2 rounded-full ${isCurrent ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                                                {index < revisions.length - 1 && (
                                                    <div className="w-px flex-1 bg-muted/40 mt-1 min-h-[16px]" />
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-semibold">v{rev.revisionNumber}</span>
                                                    {isCurrent && (
                                                        <Badge variant="secondary" className="text-xs text-emerald-600 bg-emerald-500/10 border-emerald-500/20">
                                                            actual
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(rev.publishedAt)}</p>
                                                {rev.notes && (
                                                    <p className="text-xs text-foreground/70 mt-1 line-clamp-2 italic">"{rev.notes}"</p>
                                                )}

                                                {/* Preview expandible */}
                                                {isExpanded && summary && (
                                                    <div className="mt-2 rounded-md border bg-muted/30 px-3 py-2 space-y-1 text-xs text-foreground/80">
                                                        {summary.firma && (
                                                            <p><span className="font-medium">Firma:</span> {summary.firma}</p>
                                                        )}
                                                        {summary.negocio && (
                                                            <p><span className="font-medium">Negocio:</span> {summary.negocio}{summary.sector ? ` · ${summary.sector}` : ""}</p>
                                                        )}
                                                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
                                                            {summary.training > 0 && <span>👋 {summary.training} inicio</span>}
                                                            {summary.faq > 0 && <span>❓ {summary.faq} preguntas</span>}
                                                            {summary.products > 0 && <span>💎 {summary.products} productos</span>}
                                                            {summary.extras > 0 && <span>⚙️ {summary.extras} extras</span>}
                                                            {summary.management > 0 && <span>📦 {summary.management} gestión</span>}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Botones */}
                                                <div className="flex items-center gap-1 mt-1.5">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-6 gap-1 text-xs px-1.5 text-muted-foreground hover:text-foreground"
                                                        onClick={() => setExpandedId(isExpanded ? null : rev.id)}
                                                    >
                                                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                        {isExpanded ? "Ocultar" : "Ver detalle"}
                                                    </Button>
                                                    {!isCurrent && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-6 gap-1 text-xs px-1.5 text-muted-foreground hover:text-foreground"
                                                            disabled={isPending}
                                                            onClick={() => handleRestore(rev.revisionNumber)}
                                                        >
                                                            {isRestoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                                                            Restaurar
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
