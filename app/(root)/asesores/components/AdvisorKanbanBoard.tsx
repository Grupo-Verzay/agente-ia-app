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
import {
    Loader2, RefreshCw, User, Users, Bell, Tag, Clock,
    X, Search, Settings2, UserCheck, UserX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtPhone } from '@/lib/whatsapp-jid';
import { getKanbanSessionsAction, type KanbanCard } from '@/actions/crm-kanban-actions';
import { assignSessionToAdvisor } from '@/actions/advisor-assign-actions';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AdvisorAutomationsPanel } from '@/app/(root)/crm/rules/components/AdvisorAutomationsPanel';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AdvisorInfo = { id: string; name: string | null; email: string };

type DragData = { card: KanbanCard; fromAdvisorId: string | null };

interface AdvisorColumn {
    id: string | null; // null = "Sin asignar"
    label: string;
    color: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// Paleta estable por índice de asesor
const ADVISOR_PALETTE = ['#2563EB', '#7C3AED', '#0891B2', '#DB2777', '#059669', '#D97706', '#DC2626', '#4F46E5'];
const UNASSIGNED_COLOR = '#64748B';

function timeAgo(iso: string | null) {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
}

function columnDropId(advisorId: string | null) {
    return advisorId !== null ? `adv-${advisorId}` : 'SIN_ASIGNAR';
}

// ─── Card Item ────────────────────────────────────────────────────────────────

function AdvisorKanbanCardItem({
    card,
    isDragging = false,
}: {
    card: KanbanCard;
    isDragging?: boolean;
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
                        <p className="app-item-title truncate leading-tight">{card.pushName}</p>
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

            {card.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {card.tags.slice(0, 2).map((tag) => (
                        <Badge
                            key={tag.id}
                            variant="outline"
                            className="text-[10px] h-4 px-1.5 py-0 uppercase"
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

function DraggableCard({
    card,
    fromAdvisorId,
}: {
    card: KanbanCard;
    fromAdvisorId: string | null;
}) {
    const draggableId = `${card.id}-${fromAdvisorId ?? 'none'}`;
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: draggableId,
        data: { card, fromAdvisorId } satisfies DragData,
    });

    const style = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, position: 'relative' as const }
        : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
            <AdvisorKanbanCardItem card={card} isDragging={isDragging} />
        </div>
    );
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

function AdvisorKanbanColumn({
    col,
    cards,
    userId,
}: {
    col: AdvisorColumn;
    cards: KanbanCard[];
    userId: string;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: columnDropId(col.id) });
    const headerColor = col.color;
    const [automationsOpen, setAutomationsOpen] = useState(false);
    const isUnassigned = col.id === null;

    return (
        <div
            className="flex flex-col min-w-[260px] w-[260px] shrink-0 rounded-xl border-2 overflow-hidden shadow-sm h-full"
            style={{ borderColor: headerColor + '52', backgroundColor: headerColor + '0A' }}
        >
            <div
                className="px-3 py-2 flex items-center justify-between shrink-0"
                style={{ backgroundColor: headerColor }}
            >
                <div className="flex items-center gap-1.5 min-w-0">
                    {isUnassigned
                        ? <UserX className="h-3.5 w-3.5 text-white/80 shrink-0" />
                        : <UserCheck className="h-3.5 w-3.5 text-white/80 shrink-0" />}
                    <span className="text-white text-sm font-semibold truncate">{col.label}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Badge className="bg-white/20 text-white border-0 text-xs font-medium">
                        {cards.length}
                    </Badge>
                    <button
                        onClick={() => setAutomationsOpen(true)}
                        className="p-0.5 rounded hover:bg-white/20 transition-colors"
                        title="Automaciones"
                    >
                        <Settings2 className="h-3.5 w-3.5 text-white/80" />
                    </button>
                </div>
            </div>

            <Sheet open={automationsOpen} onOpenChange={setAutomationsOpen}>
                <SheetContent side="right" className="w-[420px] sm:w-[480px] overflow-y-auto">
                    <SheetHeader className="mb-4">
                        <SheetTitle className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4" style={{ color: headerColor }} />
                            Automaciones — {col.label}
                        </SheetTitle>
                    </SheetHeader>
                    <AdvisorAutomationsPanel userId={userId} advisorId={col.id} advisorLabel={col.label} />
                </SheetContent>
            </Sheet>

            <div
                ref={setNodeRef}
                className={cn(
                    'flex-1 min-h-0 p-2 space-y-2 transition-colors overflow-y-auto',
                    isOver && 'ring-2 ring-inset ring-primary/30 bg-primary/5',
                )}
            >
                {cards.map((card) => (
                    <DraggableCard
                        key={`${card.id}-${col.id ?? 'none'}`}
                        card={card}
                        fromAdvisorId={col.id}
                    />
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

export function AdvisorKanbanBoard({
    userId,
    advisors,
}: {
    userId: string;
    advisors: AdvisorInfo[];
}) {
    const [cards, setCards] = useState<KanbanCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeData, setActiveData] = useState<DragData | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const pendingRef = useRef(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    const columns = useMemo<AdvisorColumn[]>(() => [
        { id: null, label: 'Sin asignar', color: UNASSIGNED_COLOR },
        ...advisors.map((a, i) => ({
            id: a.id,
            label: a.name?.trim() || a.email,
            color: ADVISOR_PALETTE[i % ADVISOR_PALETTE.length],
        })),
    ], [advisors]);

    const advisorIds = useMemo(() => new Set(advisors.map((a) => a.id)), [advisors]);

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

    const columnCards = (advisorId: string | null) => {
        if (advisorId === null) {
            // "Sin asignar": nulos o asignados a alguien fuera del equipo actual
            return filteredCards.filter((c) => !c.assignedAdvisorId || !advisorIds.has(c.assignedAdvisorId));
        }
        return filteredCards.filter((c) => c.assignedAdvisorId === advisorId);
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

        const { card, fromAdvisorId } = data;
        const overId = over.id as string;

        let toAdvisorId: string | null = null;
        if (overId !== 'SIN_ASIGNAR' && overId.startsWith('adv-')) {
            toAdvisorId = overId.replace('adv-', '');
        }

        if (fromAdvisorId === toAdvisorId) return;

        // Optimista
        setCards((prev) => prev.map((c) =>
            c.id === card.id ? { ...c, assignedAdvisorId: toAdvisorId } : c
        ));

        pendingRef.current = true;
        try {
            const res = await assignSessionToAdvisor(card.id, toAdvisorId);
            if (!res.success) throw new Error(res.message);
            if (res.warning) toast.warning(res.warning);
            else toast.success(toAdvisorId ? 'Contacto reasignado' : 'Contacto liberado');
        } catch (err) {
            setCards((prev) => prev.map((c) => c.id === card.id ? card : c));
            toast.error(err instanceof Error ? err.message : 'No se pudo reasignar el contacto');
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

    const isFiltered = !!searchQuery.trim();

    return (
        <div className="flex flex-col gap-3 min-w-0 w-full flex-1 min-h-0">
            {/* Toolbar */}
            <div className="flex items-center gap-2 min-w-0">
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

                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <span className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                        <Users className="h-3.5 w-3.5" />
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
                <div className="overflow-x-auto w-full flex-1 min-h-0 pb-3">
                    <div className="flex gap-3 h-full" style={{ width: 'max-content', minWidth: '100%' }}>
                        {columns.map((col) => (
                            <AdvisorKanbanColumn
                                key={col.id ?? 'none'}
                                col={col}
                                cards={columnCards(col.id)}
                                userId={userId}
                            />
                        ))}
                    </div>
                </div>

                <DragOverlay>
                    {activeData && (
                        <div className="w-[244px] rotate-2 shadow-2xl">
                            <AdvisorKanbanCardItem card={activeData.card} isDragging />
                        </div>
                    )}
                </DragOverlay>
            </DndContext>
        </div>
    );
}
