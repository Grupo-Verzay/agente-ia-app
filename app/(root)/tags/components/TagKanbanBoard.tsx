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
import { Loader2, RefreshCw, User, Users, Bell, Tag, Clock, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getKanbanSessionsAction, type KanbanCard } from '@/actions/crm-kanban-actions';
import { assignTagToSessionAction, removeTagFromSessionAction } from '@/actions/tag-actions';
import type { SimpleTag } from '@/types/session';

// ─── Types ────────────────────────────────────────────────────────────────────

type DragData = { card: KanbanCard; fromTagId: number | null };

interface TagColumn {
    id: number | null;
    label: string;
    color: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LEAD_STATUS_COLORS: Record<string, string> = {
    FRIO: '#3B82F6',
    TIBIO: '#F59E0B',
    CALIENTE: '#EF4444',
    FINALIZADO: '#22C55E',
    DESCARTADO: '#6B7280',
};

const LEAD_STATUS_LABELS: Record<string, string> = {
    FRIO: 'Frío',
    TIBIO: 'Tibio',
    CALIENTE: 'Caliente',
    FINALIZADO: 'Finalizado',
    DESCARTADO: 'Descartado',
};

const DEFAULT_TAG_COLOR = '#64748B';

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

function columnDropId(tagId: number | null) {
    return tagId !== null ? `tag-${tagId}` : 'SIN_ETIQUETA';
}

// ─── Card Item ────────────────────────────────────────────────────────────────

function TagKanbanCardItem({
    card,
    currentTagId,
    isDragging = false,
}: {
    card: KanbanCard;
    currentTagId: number | null;
    isDragging?: boolean;
}) {
    const ago = timeAgo(card.leadStatusUpdatedAt);
    const otherTags = card.tags.filter((t) => t.id !== currentTagId);

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
                </div>
            </div>

            {card.leadStatus && (
                <div
                    className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: LEAD_STATUS_COLORS[card.leadStatus] ?? '#6B7280' }}
                >
                    {LEAD_STATUS_LABELS[card.leadStatus] ?? card.leadStatus}
                </div>
            )}

            {otherTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {otherTags.slice(0, 2).map((tag) => (
                        <Badge
                            key={tag.id}
                            variant="outline"
                            className="text-[10px] h-4 px-1.5 py-0"
                            style={tag.color ? {
                                borderColor: tag.color + '60',
                                color: tag.color,
                                backgroundColor: tag.color + '15',
                            } : undefined}
                        >
                            <Tag className="h-2 w-2 mr-0.5" />
                            {tag.name}
                        </Badge>
                    ))}
                    {otherTags.length > 2 && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0">
                            +{otherTags.length - 2}
                        </Badge>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Draggable wrapper ────────────────────────────────────────────────────────

function DraggableCard({ card, fromTagId }: { card: KanbanCard; fromTagId: number | null }) {
    const draggableId = `${card.id}-${fromTagId ?? 'none'}`;
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: draggableId,
        data: { card, fromTagId } satisfies DragData,
    });

    const style = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, position: 'relative' as const }
        : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
            <TagKanbanCardItem card={card} currentTagId={fromTagId} isDragging={isDragging} />
        </div>
    );
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

function TagKanbanColumn({ col, cards }: { col: TagColumn; cards: KanbanCard[] }) {
    const { setNodeRef, isOver } = useDroppable({ id: columnDropId(col.id) });
    const headerColor = col.color ?? DEFAULT_TAG_COLOR;

    return (
        <div
            className="flex flex-col min-w-[260px] w-[260px] shrink-0 rounded-xl border-2 overflow-hidden shadow-sm h-full"
            style={{ borderColor: headerColor + '52', backgroundColor: headerColor + '0A' }}
        >
            <div
                className="px-3 py-2 flex items-center justify-between shrink-0"
                style={{ backgroundColor: headerColor }}
            >
                <div className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-white/80" />
                    <span className="text-white text-sm font-semibold">{col.label}</span>
                </div>
                <Badge className="bg-white/20 text-white border-0 text-xs font-medium">
                    {cards.length}
                </Badge>
            </div>

            <div
                ref={setNodeRef}
                className={cn(
                    'flex-1 min-h-0 p-2 space-y-2 transition-colors overflow-y-auto',
                    isOver && 'ring-2 ring-inset ring-primary/30 bg-primary/5',
                )}
            >
                {cards.map((card) => (
                    <DraggableCard key={`${card.id}-${col.id}`} card={card} fromTagId={col.id} />
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

export function TagKanbanBoard({
    userId,
    initialTags,
}: {
    userId: string;
    initialTags: SimpleTag[];
}) {
    const [cards, setCards] = useState<KanbanCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeData, setActiveData] = useState<DragData | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const pendingRef = useRef(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    const columns = useMemo<TagColumn[]>(() => [
        { id: null, label: 'Sin etiqueta', color: null },
        ...initialTags.map((t) => ({ id: t.id, label: t.name, color: t.color ?? null })),
    ], [initialTags]);

    const loadCards = useCallback(async () => {
        setLoading(true);
        const res = await getKanbanSessionsAction();
        if (res.success && res.data) {
            setCards(res.data);
        } else {
            toast.error(res.message ?? 'Error al cargar el tablero');
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadCards(); }, [loadCards]);

    const filteredCards = useMemo(() => {
        if (!searchQuery.trim()) return cards;
        const q = searchQuery.toLowerCase().trim();
        return cards.filter((c) =>
            (c.pushName ?? '').toLowerCase().includes(q) ||
            c.remoteJid.toLowerCase().includes(q)
        );
    }, [cards, searchQuery]);

    const columnCards = (tagId: number | null) => {
        if (tagId === null) return filteredCards.filter((c) => c.tags.length === 0);
        return filteredCards.filter((c) => c.tags.some((t) => t.id === tagId));
    };

    const handleDragStart = (e: DragStartEvent) => {
        const data = e.active.data.current as DragData | undefined;
        setActiveData(data ?? null);
    };

    const handleDragEnd = async (e: DragEndEvent) => {
        setActiveData(null);
        const { active, over } = e;
        if (!over || pendingRef.current) return;

        const data = active.data.current as DragData | undefined;
        if (!data) return;

        const { card, fromTagId } = data;
        const overId = over.id as string;

        let toTagId: number | null = null;
        if (overId !== 'SIN_ETIQUETA' && overId.startsWith('tag-')) {
            toTagId = parseInt(overId.replace('tag-', ''), 10);
        }

        if (fromTagId === toTagId) return;

        // Optimistic update
        setCards((prev) => prev.map((c) => {
            if (c.id !== card.id) return c;
            let newTags = [...c.tags];
            if (fromTagId !== null) {
                newTags = newTags.filter((t) => t.id !== fromTagId);
            }
            if (toTagId !== null && !newTags.some((t) => t.id === toTagId)) {
                const destTag = initialTags.find((t) => t.id === toTagId);
                if (destTag) {
                    newTags = [...newTags, {
                        id: destTag.id,
                        name: destTag.name,
                        color: destTag.color ?? null,
                        slug: destTag.slug,
                    }];
                }
            }
            return { ...c, tags: newTags };
        }));

        pendingRef.current = true;
        try {
            if (fromTagId !== null) {
                const res = await removeTagFromSessionAction({ userId, sessionId: card.id, tagId: fromTagId });
                if (!res.success) throw new Error(res.message);
            }
            if (toTagId !== null) {
                const res = await assignTagToSessionAction({ userId, sessionId: card.id, tagId: toTagId });
                if (!res.success) throw new Error(res.message);
            }
        } catch {
            setCards((prev) => prev.map((c) => c.id === card.id ? card : c));
            toast.error('No se pudo actualizar la etiqueta del contacto');
        } finally {
            pendingRef.current = false;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 min-w-0 w-full flex-1 min-h-0 rounded-xl border-2 border-border/70 bg-card/50 p-4 shadow-md">
            {/* Toolbar */}
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <div className="relative w-72 shrink-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Buscar contacto…"
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

                {/* Tag pills con conteo */}
                <div className="hidden sm:flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-1 overflow-x-auto flex-1 min-w-0">
                    {columns.map((col) => {
                        const dotColor = col.color ?? DEFAULT_TAG_COLOR;
                        const count = col.id === null
                            ? cards.filter((c) => c.tags.length === 0).length
                            : cards.filter((c) => c.tags.some((t) => t.id === col.id)).length;
                        return (
                            <span key={col.id ?? 'none'} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs text-muted-foreground whitespace-nowrap">
                                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                                {col.label}
                                {count > 0 && (
                                    <span className="font-bold text-white px-1 rounded-full text-[10px]" style={{ backgroundColor: dotColor }}>
                                        {count}
                                    </span>
                                )}
                            </span>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <span className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                        <Users className="h-3.5 w-3.5" />
                        <span className="font-medium text-foreground">
                            {searchQuery ? `${filteredCards.length}/${cards.length}` : cards.length}
                        </span>
                    </span>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={loadCards} title="Actualizar">
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Board */}
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="overflow-x-auto w-full flex-1 min-h-0 pb-3">
                    <div className="flex gap-3 h-full" style={{ width: 'max-content', minWidth: '100%' }}>
                        {columns.map((col) => (
                            <TagKanbanColumn key={col.id ?? 'none'} col={col} cards={columnCards(col.id)} />
                        ))}
                    </div>
                </div>

                <DragOverlay>
                    {activeData && (
                        <div className="w-[244px] rotate-2 shadow-2xl">
                            <TagKanbanCardItem card={activeData.card} currentTagId={activeData.fromTagId} isDragging />
                        </div>
                    )}
                </DragOverlay>
            </DndContext>
        </div>
    );
}
