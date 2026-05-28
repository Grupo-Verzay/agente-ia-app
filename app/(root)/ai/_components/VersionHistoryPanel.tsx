"use client";

import { useEffect, useState, useTransition } from "react";
import { History, RotateCcw, Loader2 } from "lucide-react";
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
};

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    promptId: string;
    currentVersion: number;
    onRestored: () => void;
}

export function VersionHistoryPanel({ open, onOpenChange, promptId, currentVersion, onRestored }: Props) {
    const [revisions, setRevisions] = useState<Revision[]>([]);
    const [loading, setLoading] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [restoringId, setRestoringId] = useState<number | null>(null);

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
            const res = await restoreRevision({
                promptId,
                revisionNumber,
                revalidate: "/ia",
            });
            if (res.ok) {
                toast.success(`Versión ${revisionNumber} restaurada. Recargando…`);
                onRestored();
            } else {
                toast.error(res.error ?? "No se pudo restaurar");
            }
            setRestoringId(null);
        });
    };

    const formatDate = (date: Date) => {
        const d = new Date(date);
        return d.toLocaleDateString("es", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-sm flex flex-col p-0">
                <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
                    <SheetTitle className="flex items-center gap-2 text-base">
                        <History className="h-4 w-4" />
                        Historial de versiones
                    </SheetTitle>
                    <p className="text-xs text-muted-foreground">
                        Versión actual: <span className="font-semibold text-foreground">v{currentVersion}</span>
                        {" · "}Cada guardado crea una nueva versión.
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
                            {revisions.map((rev) => {
                                const isCurrent = rev.revisionNumber === currentVersion;
                                const isRestoring = restoringId === rev.revisionNumber;

                                return (
                                    <li key={rev.id} className="px-4 py-3 flex items-start gap-3">
                                        {/* Línea de tiempo */}
                                        <div className="flex flex-col items-center shrink-0">
                                            <div className={`h-2 w-2 rounded-full mt-2 ${isCurrent ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                                            <div className="w-px flex-1 bg-muted/40 mt-1 min-h-[16px]" />
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
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {formatDate(rev.publishedAt)}
                                            </p>
                                            {rev.notes && (
                                                <p className="text-xs text-foreground/70 mt-1 line-clamp-2">{rev.notes}</p>
                                            )}
                                        </div>

                                        {/* Acción */}
                                        {!isCurrent && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="shrink-0 h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                                                disabled={isPending}
                                                onClick={() => handleRestore(rev.revisionNumber)}
                                            >
                                                {isRestoring ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                )}
                                                Restaurar
                                            </Button>
                                        )}
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
