'use client';

import { useState, useEffect } from 'react';
import { Brain, TrendingUp, Tag, Bell, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { getSessionLatestSummarySnapshot } from '@/actions/crm-follow-up-actions';
import { scoreLeadBySessionId } from '@/actions/lead-score-action';
import type { Session } from '@/types/session';
import type { LeadStatus } from '@prisma/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
    if (score >= 76) return '#22C55E';
    if (score >= 51) return '#F59E0B';
    if (score >= 26) return '#F97316';
    return '#EF4444';
}

const LEAD_STATUS_CONFIG: Record<LeadStatus, { label: string; color: string }> = {
    FRIO:       { label: 'Frío',       color: '#3B82F6' },
    TIBIO:      { label: 'Tibio',      color: '#F59E0B' },
    CALIENTE:   { label: 'Caliente',   color: '#EF4444' },
    FINALIZADO: { label: 'Finalizado', color: '#16A34A' },
    DESCARTADO: { label: 'Descartado', color: '#6B7280' },
};

function timeAgo(iso: string | Date | null) {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LeadContextSheetProps {
    session: Session;
    onScoreUpdated?: () => void;
}

export function LeadContextSheet({ session, onScoreUpdated }: LeadContextSheetProps) {
    const [open, setOpen] = useState(false);
    const [synthesis, setSynthesis] = useState<string | null>(null);
    const [loadingSynthesis, setLoadingSynthesis] = useState(false);
    const [scoring, setScoring] = useState(false);
    const [localScore, setLocalScore] = useState<number | null>(session.leadScore ?? null);
    const [localReason, setLocalReason] = useState<string | null>(session.leadScoreReason ?? null);

    useEffect(() => {
        if (!open) return;
        setLoadingSynthesis(true);
        getSessionLatestSummarySnapshot(session.id).then((res) => {
            if (res.success && res.data?.summarySnapshot) {
                setSynthesis(res.data.summarySnapshot);
            }
            setLoadingSynthesis(false);
        });
    }, [open, session.id]);

    const handleScore = async () => {
        setScoring(true);
        const res = await scoreLeadBySessionId(session.id);
        if (res.success && res.score !== undefined) {
            setLocalScore(res.score);
            setLocalReason(res.reason ?? null);
            toast.success(`Lead puntuado: ${res.score}/100`);
            onScoreUpdated?.();
        } else {
            toast.error(res.message ?? 'Error al puntuar');
        }
        setScoring(false);
    };

    const statusCfg = session.leadStatus ? LEAD_STATUS_CONFIG[session.leadStatus] : null;
    const pendingFollowUps = session.crmFollowUpSummary?.pending ?? 0;

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    title={localScore !== null ? `Score: ${localScore}/100` : 'Ver contexto del lead'}
                >
                    {localScore !== null ? (
                        <span className="text-[10px] font-bold leading-none" style={{ color: scoreColor(localScore) }}>
                            {localScore}
                        </span>
                    ) : (
                        <Brain className="h-3.5 w-3.5" />
                    )}
                </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-full sm:w-[420px] flex flex-col gap-0 p-0">
                <SheetHeader className="px-5 pt-5 pb-4 border-b">
                    <SheetTitle className="flex items-center gap-2 text-base">
                        <Brain className="h-4 w-4 text-primary" />
                        Contexto del lead
                    </SheetTitle>
                    <p className="text-sm text-muted-foreground truncate">{session.pushName}</p>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                    {/* ── Score ── */}
                    <section className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                            <TrendingUp className="h-3.5 w-3.5" />
                            Puntuación IA
                        </h3>
                        {localScore !== null ? (
                            <div className="rounded-lg border p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div
                                        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-white font-bold text-lg"
                                        style={{ backgroundColor: scoreColor(localScore) }}
                                    >
                                        <TrendingUp className="h-4 w-4" />
                                        {localScore}<span className="text-sm font-normal opacity-80">/100</span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleScore}
                                        disabled={scoring}
                                        className="gap-1.5 text-xs h-7"
                                        title="Re-puntuar"
                                    >
                                        {scoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                        Re-puntuar
                                    </Button>
                                </div>
                                {localReason && (
                                    <p className="text-sm text-muted-foreground leading-relaxed">{localReason}</p>
                                )}
                                {session.leadScoredAt && (
                                    <p className="text-[11px] text-muted-foreground/60">{timeAgo(session.leadScoredAt)}</p>
                                )}
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed p-4 flex items-center justify-between gap-3">
                                <p className="text-sm text-muted-foreground">Sin puntuación aún</p>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleScore}
                                    disabled={scoring}
                                    className="gap-1.5 h-8"
                                >
                                    {scoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                    Puntuar
                                </Button>
                            </div>
                        )}
                    </section>

                    {/* ── Estado del lead ── */}
                    <section className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Estado del lead
                        </h3>
                        {statusCfg ? (
                            <div className="rounded-lg border p-3 space-y-1.5">
                                <Badge
                                    className="text-white border-0 font-semibold"
                                    style={{ backgroundColor: statusCfg.color }}
                                >
                                    {statusCfg.label}
                                </Badge>
                                {session.leadStatusReason && (
                                    <p className="text-sm text-muted-foreground leading-relaxed">{session.leadStatusReason}</p>
                                )}
                                {session.leadStatusUpdatedAt && (
                                    <p className="text-[11px] text-muted-foreground/60">{timeAgo(session.leadStatusUpdatedAt)}</p>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-3">Sin clasificar</p>
                        )}
                    </section>

                    {/* ── Síntesis IA ── */}
                    <section className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                            <Brain className="h-3.5 w-3.5" />
                            Síntesis IA
                        </h3>
                        {loadingSynthesis ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Cargando síntesis…
                            </div>
                        ) : synthesis ? (
                            <div className="rounded-lg border p-3 bg-muted/20">
                                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{synthesis}</p>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-3">Sin síntesis disponible</p>
                        )}
                    </section>

                    {/* ── Etiquetas ── */}
                    {session.tags && session.tags.length > 0 && (
                        <section className="space-y-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <Tag className="h-3.5 w-3.5" />
                                Etiquetas
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                                {session.tags.map((tag) => (
                                    <Badge
                                        key={tag.id}
                                        variant="outline"
                                        className="text-xs"
                                        style={tag.color ? {
                                            borderColor: tag.color + '60',
                                            color: tag.color,
                                            backgroundColor: tag.color + '15',
                                        } : undefined}
                                    >
                                        {tag.name}
                                    </Badge>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ── Follow-ups ── */}
                    {pendingFollowUps > 0 && (
                        <section className="space-y-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <Bell className="h-3.5 w-3.5" />
                                Follow-ups pendientes
                            </h3>
                            <div className="rounded-lg border p-3 flex items-center gap-2">
                                <Bell className="h-4 w-4 text-amber-500" />
                                <span className="text-sm font-medium text-amber-600">
                                    {pendingFollowUps} pendiente{pendingFollowUps > 1 ? 's' : ''}
                                </span>
                            </div>
                        </section>
                    )}

                </div>
            </SheetContent>
        </Sheet>
    );
}
