'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, User, Users, Bell, Tag, Clock, X, Search, Sparkles, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getKanbanSessionsAction, type KanbanCard } from '@/actions/crm-kanban-actions';
import { updateSessionLeadStatus } from '@/actions/session-action';
import { scoreLeadBySessionId, scoreAllLeadsByUserId } from '@/actions/lead-score-action';
import type { LeadStatus } from '@prisma/client';

// ─── Column config ────────────────────────────────────────────────────────────

type ColumnId = LeadStatus | 'SIN_CLASIFICAR';

const COLUMNS: {
    id: ColumnId;
    label: string;
    status: LeadStatus | null;
    headerClass: string;
    borderColor: string;
    dotClass: string;
}[] = [
    {
        id: 'SIN_CLASIFICAR',
        label: 'Sin clasificar',
        status: null,
        headerClass: 'bg-slate-500',
        borderColor: '#64748B',
        dotClass: 'bg-slate-400',
    },
    {
        id: 'FRIO',
        label: 'Frío',
        status: 'FRIO',
        headerClass: 'bg-blue-500',
        borderColor: '#3B82F6',
        dotClass: 'bg-blue-500',
    },
    {
        id: 'TIBIO',
        label: 'Tibio',
        status: 'TIBIO',
        headerClass: 'bg-amber-500',
        borderColor: '#F59E0B',
        dotClass: 'bg-amber-500',
    },
    {
        id: 'CALIENTE',
        label: 'Caliente',
        status: 'CALIENTE',
        headerClass: 'bg-red-500',
        borderColor: '#EF4444',
        dotClass: 'bg-red-500',
    },
    {
        id: 'FINALIZADO',
        label: 'Finalizado',
        status: 'FINALIZADO',
        headerClass: 'bg-green-600',
        borderColor: '#16A34A',
        dotClass: 'bg-green-500',
    },
    {
        id: 'DESCARTADO',
        label: 'Descartado',
        status: 'DESCARTADO',
        headerClass: 'bg-gray-500',
        borderColor: '#6B7280',
        dotClass: 'bg-gray-400',
    },
];

// ─── Score ranges (para el filtro local) ─────────────────────────────────────

const SCORE_RANGES = [
    { key: 'bajo',     min: 0,  max: 25  },
    { key: 'medio',    min: 26, max: 50  },
    { key: 'moderado', min: 51, max: 75  },
    { key: 'alto',     min: 76, max: 90  },
    { key: 'listo',    min: 91, max: 100 },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPhone(remoteJid: string) {
    return remoteJid.replace(/@.*/, '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '+$1 $2 $3 $4');
}

function timeAgo(iso: string | null) {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
}

function columnIdForStatus(status: LeadStatus | null): ColumnId {
    return status ?? 'SIN_CLASIFICAR';
}

// ─── Score badge ─────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
    const color = score >= 76 ? '#22C55E' : score >= 51 ? '#F59E0B' : score >= 26 ? '#F97316' : '#EF4444';
    return (
        <div
            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
            style={{ backgroundColor: color }}
            title={`Lead Score: ${score}/100`}
        >
            <TrendingUp className="h-2.5 w-2.5" />
            {score}
        </div>
    );
}

// ─── Draggable Card ───────────────────────────────────────────────────────────

function KanbanCardItem({
    card,
    isDragging = false,
    onScore,
    scoring = false,
}: {
    card: KanbanCard;
    isDragging?: boolean;
    onScore?: (id: number) => void;
    scoring?: boolean;
}) {
    const ago = timeAgo(card.leadStatusUpdatedAt);
    return (
        <div className={cn(
            'bg-background rounded-lg border border-border p-3 shadow-sm space-y-2 select-none',
            isDragging && 'opacity-80 shadow-lg rotate-1 scale-105',
        )}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">{card.pushName}</p>
                        <Link
                            href={`/chats?jid=${encodeURIComponent(card.remoteJid)}`}
                            className="text-[11px] text-primary hover:underline block"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {fmtPhone(card.remoteJid)}
                        </Link>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {card.leadScore !== null && card.leadScore !== undefined && (
                        <ScoreBadge score={card.leadScore} />
                    )}
                    {card.pendingFollowUps > 0 && (
                        <div className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-1 py-0.5">
                            <Bell className="h-2.5 w-2.5" />
                            {card.pendingFollowUps}
                        </div>
                    )}
                    {ago && (
                        <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Clock className="h-2.5 w-2.5" />
                            {ago}
                        </div>
                    )}
                    {onScore && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onScore(card.id); }}
                            disabled={scoring}
                            className="flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                            title={card.leadScore !== null ? "Re-puntuar lead" : "Puntuar lead con IA"}
                        >
                            {scoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        </button>
                    )}
                </div>
            </div>

            {card.leadScoreReason && card.leadScore !== null && (
                <p className="text-[10px] text-muted-foreground/70 italic line-clamp-1">
                    {card.leadScoreReason}
                </p>
            )}

            {card.leadStatusReason && (
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {card.leadStatusReason}
                </p>
            )}

            {card.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {card.tags.slice(0, 3).map((tag) => (
                        <Badge
                            key={tag.id}
                            variant="outline"
                            className="text-[10px] h-4 px-1.5 py-0"
                            style={tag.color ? { borderColor: tag.color + '60', color: tag.color, backgroundColor: tag.color + '15' } : undefined}
                        >
                            <Tag className="h-2 w-2 mr-0.5" />
                            {tag.name}
                        </Badge>
                    ))}
                    {card.tags.length > 3 && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0">
                            +{card.tags.length - 3}
                        </Badge>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Draggable wrapper ────────────────────────────────────────────────────────

function DraggableCard({ card, onScore, scoring }: {
    card: KanbanCard;
    onScore?: (id: number) => void;
    scoring?: boolean;
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: card.id,
        data: { card },
    });

    const style = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, position: 'relative' as const }
        : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
            <KanbanCardItem card={card} isDragging={isDragging} onScore={onScore} scoring={scoring} />
        </div>
    );
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

function KanbanColumn({
    col,
    cards,
    onScore,
    scoringIds,
}: {
    col: (typeof COLUMNS)[number];
    cards: KanbanCard[];
    onScore?: (id: number) => void;
    scoringIds?: Set<number>;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: col.id });

    return (
        <div
            className="flex flex-col min-w-[260px] w-[260px] shrink-0 rounded-xl border-2 overflow-hidden shadow-sm h-full"
            style={{ borderColor: col.borderColor + '52', backgroundColor: col.borderColor + '0A' }}
        >
            {/* Header */}
            <div className={cn('px-3 py-2 flex items-center justify-between shrink-0', col.headerClass)}>
                <span className="text-white text-sm font-semibold">{col.label}</span>
                <Badge className="bg-white/20 text-white border-0 text-xs font-medium">
                    {cards.length}
                </Badge>
            </div>

            {/* Cards area — crece con el alto disponible */}
            <div
                ref={setNodeRef}
                className={cn(
                    'flex-1 min-h-0 p-2 space-y-2 transition-colors overflow-y-auto',
                    isOver && 'ring-2 ring-inset ring-primary/30 bg-primary/5',
                )}
            >
                {cards.map((card) => (
                    <DraggableCard key={card.id} card={card} onScore={onScore} scoring={scoringIds?.has(card.id)} />
                ))}
                {cards.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/40">
                        Sin contactos
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Board ───────────────────────────────────────────────────────────────

export function KanbanBoard({
    selectedScoreRanges = new Set(),
    onToggleScoreRange,
    onScoreCountsChange,
}: {
    selectedScoreRanges?: Set<string>;
    onToggleScoreRange?: (key: string) => void;
    onScoreCountsChange?: (counts: Record<string, number>) => void;
}) {
    const [cards, setCards] = useState<KanbanCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
    const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [scoringIds, setScoringIds] = useState<Set<number>>(new Set());
    const [scoringAll, setScoringAll] = useState(false);
    const pendingRef = useRef(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    const loadCards = useCallback(async () => {
        setLoading(true);
        const res = await getKanbanSessionsAction();
        if (res.success && res.data) {
            setCards(res.data);
            if (onScoreCountsChange) {
                const counts: Record<string, number> = {};
                for (const range of SCORE_RANGES) {
                    counts[range.key] = res.data.filter(
                        (c) => c.leadScore !== null && c.leadScore !== undefined && c.leadScore >= range.min && c.leadScore <= range.max
                    ).length;
                }
                onScoreCountsChange(counts);
            }
        } else {
            toast.error(res.message ?? 'Error al cargar el tablero');
        }
        setLoading(false);
    }, [onScoreCountsChange]);

    useEffect(() => { loadCards(); }, [loadCards]);

    const handleScore = useCallback(async (id: number) => {
        setScoringIds((prev) => new Set(prev).add(id));
        const res = await scoreLeadBySessionId(id);
        if (res.success && res.score !== undefined) {
            setCards((prev) => prev.map((c) =>
                c.id === id ? { ...c, leadScore: res.score!, leadScoreReason: res.reason ?? null, leadScoredAt: new Date().toISOString() } : c
            ));
            toast.success(`Lead puntuado: ${res.score}/100`);
        } else {
            toast.error(res.message ?? 'Error al puntuar el lead');
        }
        setScoringIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }, []);

    const handleScoreAll = useCallback(async () => {
        setScoringAll(true);
        const res = await scoreAllLeadsByUserId();
        if (res.success) {
            toast.success(`${res.scored ?? 0} leads puntuados`);
            await loadCards();
        } else {
            toast.error(res.message ?? 'Error en puntuación masiva');
        }
        setScoringAll(false);
    }, [loadCards]);

    // Etiquetas únicas extraídas de todos los cards
    const allTags = useMemo(() => {
        const map = new Map<number, { id: number; name: string; color: string | null }>();
        for (const card of cards) {
            for (const tag of card.tags) {
                if (!map.has(tag.id)) map.set(tag.id, tag);
            }
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }, [cards]);

    const toggleTag = (id: number) => {
        setSelectedTagIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // Cards filtrados por etiquetas, búsqueda y score
    const filteredCards = useMemo(() => {
        let result = cards;
        if (selectedTagIds.size > 0) {
            result = result.filter((c) => c.tags.some((t) => selectedTagIds.has(t.id)));
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter((c) =>
                (c.pushName ?? '').toLowerCase().includes(q) ||
                c.remoteJid.toLowerCase().includes(q)
            );
        }
        if (selectedScoreRanges.size > 0) {
            result = result.filter((c) => {
                if (c.leadScore === null) return false;
                return SCORE_RANGES.some(
                    (r) => selectedScoreRanges.has(r.key) && c.leadScore! >= r.min && c.leadScore! <= r.max
                );
            });
        }
        return result;
    }, [cards, selectedTagIds, searchQuery, selectedScoreRanges]);

    const handleDragStart = (e: DragStartEvent) => {
        const card = filteredCards.find((c) => c.id === e.active.id);
        setActiveCard(card ?? null);
    };

    const handleDragEnd = async (e: DragEndEvent) => {
        setActiveCard(null);
        const { active, over } = e;
        if (!over || pendingRef.current) return;

        const card = cards.find((c) => c.id === active.id);
        if (!card) return;

        const targetColId = over.id as ColumnId;
        const targetCol = COLUMNS.find((c) => c.id === targetColId);
        if (!targetCol) return;

        const newStatus = targetCol.status;
        if (newStatus === card.leadStatus) return;

        // Optimistic update
        setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, leadStatus: newStatus, leadStatusUpdatedAt: new Date().toISOString() } : c));

        pendingRef.current = true;
        try {
            await updateSessionLeadStatus(card.id, newStatus);
        } catch {
            setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, leadStatus: card.leadStatus, leadStatusUpdatedAt: card.leadStatusUpdatedAt } : c));
            toast.error('No se pudo actualizar el estado del contacto');
        } finally {
            pendingRef.current = false;
        }
    };

    const columnCards = (col: (typeof COLUMNS)[number]) =>
        filteredCards.filter((c) => columnIdForStatus(c.leadStatus) === col.id);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 min-w-0 w-full flex-1 min-h-0 rounded-xl border-2 border-border/70 bg-card/50 p-4 shadow-md">
            {/* Toolbar: Búsqueda + etiquetas + contador + botones */}
            <div className="flex items-center gap-2 min-w-0">
                <div className="relative w-64 shrink-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Buscar…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>

                {allTags.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 pb-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 #e2e8f0' }}>
                        <Tag className="h-4 w-4 text-amber-500 shrink-0" />
                        {allTags.map((tag) => {
                            const active = selectedTagIds.has(tag.id);
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    onClick={() => toggleTag(tag.id)}
                                    className={cn(
                                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all shrink-0 text-foreground',
                                        active ? 'shadow-sm' : 'opacity-70 hover:opacity-100',
                                    )}
                                    style={tag.color ? {
                                        borderColor: active ? tag.color : tag.color + '60',
                                        backgroundColor: active ? tag.color + '25' : tag.color + '10',
                                    } : undefined}
                                >
                                    {tag.name}
                                    {active && <X className="h-2.5 w-2.5 ml-0.5" />}
                                </button>
                            );
                        })}
                        {selectedTagIds.size > 0 && (
                            <button
                                type="button"
                                onClick={() => setSelectedTagIds(new Set())}
                                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
                            >
                                Limpiar
                            </button>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <span className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                        <Users className="h-3.5 w-3.5" />
                        <span className="font-medium text-foreground">
                            {(selectedTagIds.size > 0 || searchQuery || selectedScoreRanges.size > 0)
                                ? `${filteredCards.length}/${cards.length}`
                                : filteredCards.length}
                        </span>
                    </span>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={loadCards} title="Actualizar">
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleScoreAll}
                        disabled={scoringAll}
                        className="gap-1.5 shrink-0 bg-violet-600 hover:bg-violet-700 text-white border-0"
                    >
                        {scoringAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Puntuar leads
                    </Button>
                </div>
            </div>

            {/* Board */}
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="overflow-x-auto w-full flex-1 min-h-0 pb-3">
                    <div className="flex gap-3 h-full" style={{ width: 'max-content', minWidth: '100%' }}>
                        {COLUMNS.map((col) => (
                            <KanbanColumn key={col.id} col={col} cards={columnCards(col)} onScore={handleScore} scoringIds={scoringIds} />
                        ))}
                    </div>
                </div>

                {/* Drag overlay */}
                <DragOverlay>
                    {activeCard && (
                        <div className="w-[244px] rotate-2 shadow-2xl">
                            <KanbanCardItem card={activeCard} isDragging />
                        </div>
                    )}
                </DragOverlay>
            </DndContext>
        </div>
    );
}
