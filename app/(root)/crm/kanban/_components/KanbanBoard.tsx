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
import { Loader2, RefreshCw, User, Bell, Tag, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getKanbanSessionsAction, type KanbanCard } from '@/actions/crm-kanban-actions';
import { updateSessionLeadStatus } from '@/actions/session-action';
import type { LeadStatus } from '@prisma/client';

// ─── Column config ────────────────────────────────────────────────────────────

type ColumnId = LeadStatus | 'SIN_CLASIFICAR';

const COLUMNS: {
    id: ColumnId;
    label: string;
    status: LeadStatus | null;
    headerClass: string;
    bgClass: string;
    dotClass: string;
}[] = [
    {
        id: 'SIN_CLASIFICAR',
        label: 'Sin clasificar',
        status: null,
        headerClass: 'bg-slate-500',
        bgClass: 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700',
        dotClass: 'bg-slate-400',
    },
    {
        id: 'FRIO',
        label: 'Frío',
        status: 'FRIO',
        headerClass: 'bg-blue-500',
        bgClass: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
        dotClass: 'bg-blue-500',
    },
    {
        id: 'TIBIO',
        label: 'Tibio',
        status: 'TIBIO',
        headerClass: 'bg-amber-500',
        bgClass: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
        dotClass: 'bg-amber-500',
    },
    {
        id: 'CALIENTE',
        label: 'Caliente',
        status: 'CALIENTE',
        headerClass: 'bg-red-500',
        bgClass: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
        dotClass: 'bg-red-500',
    },
    {
        id: 'FINALIZADO',
        label: 'Finalizado',
        status: 'FINALIZADO',
        headerClass: 'bg-green-600',
        bgClass: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
        dotClass: 'bg-green-500',
    },
    {
        id: 'DESCARTADO',
        label: 'Descartado',
        status: 'DESCARTADO',
        headerClass: 'bg-gray-500',
        bgClass: 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700',
        dotClass: 'bg-gray-400',
    },
];

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

// ─── Draggable Card ───────────────────────────────────────────────────────────

function KanbanCardItem({ card, isDragging = false }: { card: KanbanCard; isDragging?: boolean }) {
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
                            className="text-[11px] text-primary hover:underline truncate block"
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

function DraggableCard({ card }: { card: KanbanCard }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: card.id,
        data: { card },
    });

    const style = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, position: 'relative' as const }
        : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
            <KanbanCardItem card={card} isDragging={isDragging} />
        </div>
    );
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

function KanbanColumn({
    col,
    cards,
}: {
    col: (typeof COLUMNS)[number];
    cards: KanbanCard[];
}) {
    const { setNodeRef, isOver } = useDroppable({ id: col.id });

    return (
        <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
            {/* Header */}
            <div className={cn('rounded-t-lg px-3 py-2 flex items-center justify-between', col.headerClass)}>
                <span className="text-white text-sm font-semibold">{col.label}</span>
                <Badge className="bg-white/20 text-white border-0 text-xs font-medium">
                    {cards.length}
                </Badge>
            </div>

            {/* Cards area — altura fija + scroll vertical interno */}
            <div
                ref={setNodeRef}
                className={cn(
                    'rounded-b-lg border-x border-b p-2 space-y-2 transition-colors',
                    'overflow-y-auto',
                    col.bgClass,
                    isOver && 'ring-2 ring-inset ring-primary/40',
                )}
                style={{ height: 'calc(100vh - 260px)', minHeight: '120px' }}
            >
                {cards.map((card) => (
                    <DraggableCard key={card.id} card={card} />
                ))}
                {cards.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50">
                        Sin contactos
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Board ───────────────────────────────────────────────────────────────

export function KanbanBoard() {
    const [cards, setCards] = useState<KanbanCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
    const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
    const pendingRef = useRef(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    const loadCards = useCallback(async () => {
        setLoading(true);
        const res = await getKanbanSessionsAction();
        if (res.success && res.data) setCards(res.data);
        else toast.error(res.message ?? 'Error al cargar el tablero');
        setLoading(false);
    }, []);

    useEffect(() => { loadCards(); }, [loadCards]);

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

    // Cards filtrados por etiquetas seleccionadas
    const filteredCards = useMemo(() => {
        if (selectedTagIds.size === 0) return cards;
        return cards.filter((c) => c.tags.some((t) => selectedTagIds.has(t.id)));
    }, [cards, selectedTagIds]);

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
        <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{filteredCards.length}</span>
                    {selectedTagIds.size > 0 ? (
                        <span>de {cards.length} contactos</span>
                    ) : (
                        <span>contactos en total</span>
                    )}
                </div>
                <Button variant="outline" size="sm" onClick={loadCards} className="gap-2">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Actualizar
                </Button>
            </div>

            {/* Filtro por etiquetas */}
            {allTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Tag className="h-3 w-3" /> Filtrar:
                    </span>
                    {allTags.map((tag) => {
                        const active = selectedTagIds.has(tag.id);
                        return (
                            <button
                                key={tag.id}
                                type="button"
                                onClick={() => toggleTag(tag.id)}
                                className={cn(
                                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all',
                                    active
                                        ? 'shadow-sm'
                                        : 'opacity-60 hover:opacity-90',
                                )}
                                style={tag.color ? {
                                    borderColor: active ? tag.color : tag.color + '60',
                                    color: tag.color,
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
                            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
                        >
                            Limpiar filtros
                        </button>
                    )}
                </div>
            )}

            {/* Board */}
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="overflow-x-auto overflow-y-hidden pb-1">
                    <div className="flex gap-3 min-w-max">
                        {COLUMNS.map((col) => (
                            <KanbanColumn key={col.id} col={col} cards={columnCards(col)} />
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
