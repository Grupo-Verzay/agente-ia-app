'use client';

import { useState, useEffect } from 'react';
import { Brain, TrendingUp, Tag, Bell, Loader2, Sparkles, RefreshCw, BookOpen, Check, ThumbsDown, ThumbsUp, AlertTriangle, PencilLine, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { PanelLateral } from '@/components/shared/PanelLateral';
import { PANEL_DEL_CONTEXTO } from '@/lib/panel-lateral';
import {
    createManualSynthesis,
    getSessionLatestSummarySnapshot,
    updateFollowUpSummarySnapshot,
} from '@/actions/crm-follow-up-actions';
import { comoSeGuardaLaSintesis } from '@/lib/sintesis-del-lead';
import { scoreLeadBySessionId } from '@/actions/lead-score-action';
import type { Session } from '@/types/session';
import type { LeadStatus } from '@prisma/client';
import { getSalesPlaybookAction, saveSalesPlaybookFeedbackAction } from '@/actions/sales-playbook-actions';
import type { SalesPlaybook } from '@/lib/sales-learning';

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
    /** Refresca la sesión: tras puntuar y tras guardar la síntesis. */
    onScoreUpdated?: () => void | Promise<void>;
}

export function LeadContextSheet({ session, onScoreUpdated }: LeadContextSheetProps) {
    const [open, setOpen] = useState(false);
    const [synthesis, setSynthesis] = useState<string | null>(null);
    const [loadingSynthesis, setLoadingSynthesis] = useState(false);
    // La síntesis se edita AQUÍ: antes era un icono aparte en la barra que
    // abría una ventana emergente (`SintesisEditDialog`). Mismo comportamiento:
    // con seguimiento se actualiza el suyo; sin él, se crea una manual.
    const [followUpId, setFollowUpId] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [savingSynthesis, setSavingSynthesis] = useState(false);
    const [scoring, setScoring] = useState(false);
    const [localScore, setLocalScore] = useState<number | null>(session.leadScore ?? null);
    const [localReason, setLocalReason] = useState<string | null>(session.leadScoreReason ?? null);
    const [playbook, setPlaybook] = useState<SalesPlaybook | null>(null);
    const [loadingPlaybook, setLoadingPlaybook] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState(false);

    const loadPlaybook = async () => {
        setLoadingPlaybook(true);
        try {
            const res = await getSalesPlaybookAction(session.id);
            if (res.success) setPlaybook(res.data);
            else toast.error(res.message);
        } finally {
            setLoadingPlaybook(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        setFeedbackSent(false);
        setPlaybook(null);
        setEditing(false);
        setSynthesis(null);
        setFollowUpId(null);
        setLoadingSynthesis(true);
        getSessionLatestSummarySnapshot(session.id)
            .then((res) => {
                if (res.success && res.data) {
                    setFollowUpId(res.data.id);
                    setSynthesis(res.data.summarySnapshot || null);
                }
            })
            .catch((error) => {
                console.warn('[chats] no se pudo leer la síntesis del lead', { sessionId: session.id, error });
            })
            .finally(() => setLoadingSynthesis(false));
        void loadPlaybook();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, session.id]);

    const sendFeedback = async (useful: boolean) => {
        if (!playbook || feedbackSent) return;
        const res = await saveSalesPlaybookFeedbackAction({
            sessionId: session.id,
            product: playbook.product,
            stage: playbook.stage,
            useful,
        });
        if (res.success) {
            setFeedbackSent(true);
            toast.success('Recomendación evaluada.');
        }
    };

    const startEditing = () => {
        setDraft(synthesis ?? '');
        setEditing(true);
    };

    const saveSynthesis = async () => {
        const plan = comoSeGuardaLaSintesis(followUpId, draft);
        if (plan.accion === 'nada' || savingSynthesis) return;
        setSavingSynthesis(true);
        try {
            if (plan.accion === 'actualizar') {
                const res = await updateFollowUpSummarySnapshot(plan.followUpId, plan.texto);
                if (!res.success) { toast.error(res.message); return; }
                toast.success('Síntesis actualizada');
            } else {
                const res = await createManualSynthesis(session.id, plan.texto);
                if (!res.success || !res.data) { toast.error(res.message); return; }
                setFollowUpId(res.data.id);
                toast.success('Síntesis guardada');
            }
            setSynthesis(plan.texto);
            setEditing(false);
            await onScoreUpdated?.();
        } catch (error) {
            console.warn('[chats] no se pudo guardar la síntesis del lead', { sessionId: session.id, error });
            toast.error('No se pudo guardar la síntesis.');
        } finally {
            setSavingSynthesis(false);
        }
    };

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
        <>
            <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setOpen(true)}
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

            <PanelLateral
                id={PANEL_DEL_CONTEXTO}
                abierto={open}
                onCerrar={() => setOpen(false)}
                titulo="Contexto del lead"
                subtitulo={session.pushName}
                icono={<Brain className="h-4 w-4" />}
            >
                {/* El desplazamiento lo pone PanelLateral: aqui solo el relleno. */}
                <div className="px-5 py-4 space-y-5">

                    {/* ── Score ── */}
                    <section data-bloque="puntuacion" className="space-y-2">
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

                    {/* ── Estado, etiquetas y follow-ups: formato DIRECTO ──
                      * Solo el dato, sin párrafos debajo. El porqué del estado
                      * y la hora se leen en el lead; aquí se viene a mirar de
                      * un vistazo. */}
                    <section data-bloque="estado" className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Estado del lead
                        </h3>
                        {statusCfg ? (
                            <Badge
                                className="text-white border-0 font-semibold"
                                style={{ backgroundColor: statusCfg.color }}
                            >
                                {statusCfg.label}
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-muted-foreground">Sin clasificar</Badge>
                        )}
                    </section>

                    <section data-bloque="etiquetas" className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5" />
                            Etiquetas
                        </h3>
                        {session.tags && session.tags.length > 0 ? (
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
                        ) : (
                            <p className="text-sm text-muted-foreground">—</p>
                        )}
                    </section>

                    <section data-bloque="seguimientos" className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                            <Bell className="h-3.5 w-3.5" />
                            Follow-ups pendientes
                        </h3>
                        <span
                            data-numero-de-seguimientos
                            className={pendingFollowUps > 0 ? 'text-sm font-semibold text-amber-600' : 'text-sm font-semibold text-muted-foreground'}
                        >
                            {pendingFollowUps}
                        </span>
                    </section>

                    {/* ── Síntesis IA: se lee y se edita aquí mismo ── */}
                    <section data-bloque="sintesis" className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <Brain className="h-3.5 w-3.5" />
                                Síntesis IA
                            </h3>
                            {!loadingSynthesis && !editing && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={startEditing}
                                    title="Editar síntesis"
                                    aria-label="Editar síntesis"
                                    data-editar-sintesis
                                >
                                    <PencilLine className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </div>
                        {loadingSynthesis ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Cargando síntesis…
                            </div>
                        ) : editing ? (
                            <div className="space-y-2">
                                {!followUpId && (
                                    <p className="text-xs text-muted-foreground">
                                        Este lead aún no tiene follow-up. Puedes escribir una síntesis
                                        manual para registrar contexto del lead.
                                    </p>
                                )}
                                <Textarea
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    placeholder="Escribe la síntesis del lead..."
                                    rows={8}
                                    className="resize-y min-h-[160px]"
                                    data-texto-sintesis
                                    autoFocus
                                />
                                <div className="flex items-center justify-between gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setEditing(false)}
                                        disabled={savingSynthesis}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={followUpId ? 'save' : 'default'}
                                        onClick={() => void saveSynthesis()}
                                        disabled={savingSynthesis || !draft.trim()}
                                        data-guardar-sintesis
                                    >
                                        {savingSynthesis
                                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            : !followUpId && <PlusCircle className="mr-2 h-4 w-4" />}
                                        {followUpId ? 'Guardar' : 'Guardar síntesis'}
                                    </Button>
                                </div>
                            </div>
                        ) : synthesis ? (
                            <div className="rounded-lg border p-3 bg-muted/20">
                                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{synthesis}</p>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-3">Sin síntesis disponible</p>
                        )}
                    </section>

                    {/* ── Playbook de venta ── (el último: es lo más largo) */}
                    <section data-bloque="playbook" className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <BookOpen className="h-3.5 w-3.5" />
                                Playbook de venta
                            </h3>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={loadPlaybook}
                                disabled={loadingPlaybook}
                                title="Actualizar recomendaciones"
                            >
                                {loadingPlaybook
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <RefreshCw className="h-3.5 w-3.5" />}
                            </Button>
                        </div>
                        {loadingPlaybook && !playbook ? (
                            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Analizando conversación...
                            </div>
                        ) : playbook ? (
                            <div className="space-y-3 rounded-lg border p-3">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge variant="secondary">{playbook.product}</Badge>
                                    <Badge variant="outline">
                                        {LEAD_STATUS_CONFIG[playbook.stage as LeadStatus]?.label ?? playbook.stage}
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    {playbook.evidence.label}
                                    {playbook.evidence.winRate !== null
                                        ? ` · ${playbook.evidence.winRate}% ganadas`
                                        : ''}
                                </p>
                                {[
                                    ['Preguntas recomendadas', playbook.questions],
                                    ['Próximos pasos', playbook.nextSteps],
                                    ['Argumentos útiles', playbook.arguments],
                                ].map(([title, items]) => (items as string[]).length > 0 && (
                                    <div key={title as string}>
                                        <p className="mb-1 text-xs font-semibold">{title as string}</p>
                                        <ul className="space-y-1">
                                            {(items as string[]).map((item) => (
                                                <li key={item} className="flex gap-2 text-sm">
                                                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                                {playbook.warnings.length > 0 && (
                                    <div className="space-y-1 rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
                                        {playbook.warnings.map((item) => (
                                            <p key={item} className="flex gap-1.5 text-xs">
                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                                {item}
                                            </p>
                                        ))}
                                    </div>
                                )}
                                <div className="flex items-center justify-between gap-2 border-t pt-2">
                                    <span className="text-[11px] text-muted-foreground">
                                        No se envía al cliente.
                                    </span>
                                    {feedbackSent ? (
                                        <span className="text-xs text-emerald-600">Evaluado</span>
                                    ) : (
                                        <div className="flex gap-1">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => sendFeedback(true)}
                                                title="Útil"
                                            >
                                                <ThumbsUp className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => sendFeedback(false)}
                                                title="No útil"
                                            >
                                                <ThumbsDown className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                                Sin recomendaciones disponibles
                            </p>
                        )}
                    </section>

                </div>
            </PanelLateral>
        </>
    );
}
