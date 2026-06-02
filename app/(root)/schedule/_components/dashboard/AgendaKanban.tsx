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
import { TooltipProvider } from '@/components/ui/tooltip';
import { Loader2, RefreshCw, User, Search, X, Calendar, Clock, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtPhone } from '@/lib/whatsapp-jid';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AppointmentStatus } from '@prisma/client';
import {
    getAppointmentsForKanban,
    updateAppointmentStatus,
    sendAppointmentStatusNotification,
    type AgendaKanbanCard,
} from '@/actions/appointments-actions';

// ─── Column config ─────────────────────────────────────────────────────────────

const COLUMNS: {
    id: AppointmentStatus;
    label: string;
    headerClass: string;
    borderColor: string;
}[] = [
    { id: 'PENDIENTE',   label: 'Pendiente',   headerClass: 'bg-yellow-500',  borderColor: '#EAB308' },
    { id: 'CONFIRMADA',  label: 'Confirmada',  headerClass: 'bg-green-500',   borderColor: '#22C55E' },
    { id: 'ATENDIDA',    label: 'Atendida',    headerClass: 'bg-blue-500',    borderColor: '#3B82F6' },
    { id: 'NO_ASISTIDA', label: 'No asistida', headerClass: 'bg-violet-500',  borderColor: '#8B5CF6' },
    { id: 'CANCELADA',   label: 'Cancelada',   headerClass: 'bg-red-500',     borderColor: '#EF4444' },
    { id: 'FINALIZADO',  label: 'Finalizado',  headerClass: 'bg-emerald-600', borderColor: '#059669' },
    { id: 'DESCARTADO',  label: 'Descartado',  headerClass: 'bg-zinc-600',    borderColor: '#52525B' },
];


function fmtDate(iso: string) {
    return format(new Date(iso), 'dd MMM · HH:mm', { locale: es });
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function AgendaCardItem({ card, isDragging = false }: { card: AgendaKanbanCard; isDragging?: boolean }) {
    return (
        <div className={cn(
            'bg-background rounded-lg border border-border p-3 shadow-sm space-y-2 select-none',
            isDragging && 'opacity-80 shadow-lg rotate-1 scale-105',
        )}>
            <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">
                        {card.pushName ?? 'Sin nombre'}
                    </p>
                    <Link
                        href={`/chats?jid=${encodeURIComponent(card.remoteJid)}`}
                        className="text-[11px] text-primary hover:underline block"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {fmtPhone(card.remoteJid)}
                    </Link>
                </div>
            </div>

            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" />
                {fmtDate(card.startTime)}
            </div>

            {card.serviceName && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 font-normal">
                    {card.serviceName}
                </Badge>
            )}

            {card.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {card.tags.slice(0, 2).map((tag) => (
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
                    {card.tags.length > 2 && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0">
                            +{card.tags.length - 2}
                        </Badge>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Draggable wrapper ────────────────────────────────────────────────────────

function DraggableCard({ card }: { card: AgendaKanbanCard }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: card.id,
        data: { card },
    });

    const style = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, position: 'relative' as const }
        : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
            <AgendaCardItem card={card} isDragging={isDragging} />
        </div>
    );
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

function AgendaColumn({ col, cards }: { col: (typeof COLUMNS)[number]; cards: AgendaKanbanCard[] }) {
    const { setNodeRef, isOver } = useDroppable({ id: col.id });

    return (
        <div
            className="flex flex-col min-w-[260px] w-[260px] shrink-0 rounded-xl border-2 overflow-hidden shadow-sm h-full"
            style={{ borderColor: col.borderColor + '52', backgroundColor: col.borderColor + '0A' }}
        >
            <div className={cn('px-3 py-2 flex items-center justify-between shrink-0', col.headerClass)}>
                <span className="text-white text-sm font-semibold">{col.label}</span>
                <Badge className="bg-white/20 text-white border-0 text-xs font-medium">{cards.length}</Badge>
            </div>

            <div
                ref={setNodeRef}
                className={cn(
                    'flex-1 min-h-0 p-2 space-y-2 transition-colors overflow-y-auto',
                    isOver && 'ring-2 ring-inset ring-primary/30 bg-primary/5',
                )}
            >
                {cards.map((card) => <DraggableCard key={card.id} card={card} />)}
                {cards.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/40">
                        Sin citas
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Board ───────────────────────────────────────────────────────────────

export function AgendaKanban({
    userId,
    onStatusCountsChange,
}: {
    userId: string;
    onStatusCountsChange?: (counts: { status: AppointmentStatus; count: number }[]) => void;
}) {
    const [cards, setCards] = useState<AgendaKanbanCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCard, setActiveCard] = useState<AgendaKanbanCard | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
    const pendingRef = useRef(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    const loadCards = useCallback(async () => {
        setLoading(true);
        const res = await getAppointmentsForKanban(userId);
        if (res.success && res.data) {
            setCards(res.data);
            if (onStatusCountsChange) {
                const countMap = new Map<AppointmentStatus, number>();
                for (const c of res.data) {
                    countMap.set(c.status, (countMap.get(c.status) ?? 0) + 1);
                }
                onStatusCountsChange(Array.from(countMap.entries()).map(([status, count]) => ({ status, count })));
            }
        } else {
            toast.error(res.message ?? 'Error al cargar el tablero');
        }
        setLoading(false);
    }, [userId, onStatusCountsChange]);

    useEffect(() => { loadCards(); }, [loadCards]);

    // Tags únicos de todos los contactos con citas
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

    const filteredCards = useMemo(() => {
        let result = cards;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter((c) =>
                (c.pushName ?? '').toLowerCase().includes(q) ||
                c.remoteJid.toLowerCase().includes(q) ||
                (c.serviceName ?? '').toLowerCase().includes(q)
            );
        }
        if (selectedTagIds.size > 0) {
            result = result.filter((c) => c.tags.some((t) => selectedTagIds.has(t.id)));
        }
        return result;
    }, [cards, searchQuery, selectedTagIds]);

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

        const newStatus = over.id as AppointmentStatus;
        if (newStatus === card.status) return;

        setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, status: newStatus } : c));

        pendingRef.current = true;
        try {
            const res = await updateAppointmentStatus(card.id, newStatus);
            if (!res.success) {
                setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, status: card.status } : c));
                toast.error(res.message ?? 'No se pudo actualizar el estado de la cita');
            } else {
                void sendAppointmentStatusNotification(card.id, newStatus).catch(() => undefined);
            }
        } catch {
            setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, status: card.status } : c));
            toast.error('No se pudo actualizar el estado de la cita');
        } finally {
            pendingRef.current = false;
        }
    };

    const columnCards = (col: (typeof COLUMNS)[number]) =>
        filteredCards.filter((c) => c.status === col.id);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const isFiltered = searchQuery || selectedTagIds.size > 0;

    return (
        <TooltipProvider delayDuration={120}>
            <div className="flex flex-col gap-3 min-w-0 w-full h-full">
                {/* Board card */}
                <div className="flex flex-col gap-3 min-w-0 w-full flex-1 min-h-0">
                    {/* Toolbar */}
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <div className="relative flex-1 sm:flex-none sm:w-72 min-w-0">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o teléfono…"
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

                        {/* Tag filter pills */}
                        {allTags.length > 0 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 pb-0.5">
                                <Tag className="h-3.5 w-3.5 text-amber-500 shrink-0" />
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

                        {/* Status pills */}
                        <div className="hidden sm:flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-1">
                            {COLUMNS.map((col) => {
                                const count = cards.filter((c) => c.status === col.id).length;
                                return (
                                    <span key={col.id} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs text-muted-foreground whitespace-nowrap">
                                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.borderColor }} />
                                        {col.label}
                                        {count > 0 && (
                                            <span className="font-bold text-white px-1 rounded-full text-[10px]" style={{ backgroundColor: col.borderColor }}>
                                                {count}
                                            </span>
                                        )}
                                    </span>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-auto">
                            <span className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                                <Clock className="h-3.5 w-3.5" />
                                <span className="font-medium text-foreground">
                                    {isFiltered ? `${filteredCards.length}/${cards.length}` : cards.length}
                                </span>
                            </span>
                            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={loadCards} title="Actualizar">
                                <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>

                    {/* Board */}
                    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                        <div className="relative flex-1 min-h-0">
                            <div className="pointer-events-none absolute right-0 top-0 bottom-3 w-8 bg-gradient-to-l from-card/80 to-transparent z-10 sm:hidden" />
                            <div className="overflow-x-auto w-full h-full pb-3" style={{ minHeight: 0 }}>
                                <div className="flex gap-3 h-full" style={{ width: 'max-content', minWidth: '100%' }}>
                                    {COLUMNS.map((col) => (
                                        <AgendaColumn key={col.id} col={col} cards={columnCards(col)} />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <DragOverlay>
                            {activeCard && (
                                <div className="w-[224px] rotate-2 shadow-2xl">
                                    <AgendaCardItem card={activeCard} isDragging />
                                </div>
                            )}
                        </DragOverlay>
                    </DndContext>
                </div>
            </div>
        </TooltipProvider>
    );
}
