'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    DndContext, DragEndEvent, DragOverlay, DragStartEvent,
    PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Loader2, RefreshCw, User, Calendar, Wrench, Search, X, Clock, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { AppointmentStatus } from '@prisma/client';
import { getBookingAppointments, updateBookingAppointmentStatus, deleteBookingAppointment } from '@/actions/bookings-actions';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { STATUS_LABELS } from '@/types/schedule';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ApptAutomationsPanel } from '@/app/(root)/crm/rules/components/ApptAutomationsPanel';

// ─── Column config ─────────────────────────────────────────────────────────────

const COLUMNS: { id: AppointmentStatus; label: string; headerClass: string; borderColor: string }[] = [
    { id: 'PENDIENTE',   label: 'Pendiente',   headerClass: 'bg-yellow-500',  borderColor: '#EAB308' },
    { id: 'CONFIRMADA',  label: 'Confirmada',  headerClass: 'bg-green-500',   borderColor: '#22C55E' },
    { id: 'ATENDIDA',    label: 'Atendida',    headerClass: 'bg-blue-500',    borderColor: '#3B82F6' },
    { id: 'NO_ASISTIDA', label: 'No asistida', headerClass: 'bg-violet-500',  borderColor: '#8B5CF6' },
    { id: 'CANCELADA',   label: 'Cancelada',   headerClass: 'bg-red-500',     borderColor: '#EF4444' },
    { id: 'FINALIZADO',  label: 'Finalizado',  headerClass: 'bg-emerald-600', borderColor: '#059669' },
    { id: 'DESCARTADO',  label: 'Descartado',  headerClass: 'bg-zinc-600',    borderColor: '#52525B' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingCard {
    id: string;
    clientName: string;
    clientPhone: string;
    startTime: Date;
    timezone: string;
    status: AppointmentStatus;
    teamMember: { name: string; color?: string | null };
    teamService: { name: string; duration: number };
}

// ─── Card UI ─────────────────────────────────────────────────────────────────

function BookingCardItem({ card, isDragging = false, onDelete }: {
    card: BookingCard;
    isDragging?: boolean;
    onDelete?: (id: string) => void;
}) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const localStart = toZonedTime(new Date(card.startTime), card.timezone);

    const handleDelete = async () => {
        setDeleting(true);
        const res = await deleteBookingAppointment(card.id);
        if (res.success) {
            onDelete?.(card.id);
            toast.success('Cita eliminada');
        } else {
            toast.error(res.message);
        }
        setDeleting(false);
        setConfirmDelete(false);
    };

    return (
        <>
            <div className={cn(
                'bg-background rounded-lg border border-border p-3 shadow-sm space-y-2 select-none',
                isDragging && 'opacity-80 shadow-lg rotate-1 scale-105',
            )}>
                <div className="flex items-start gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate leading-tight capitalize">{card.clientName || 'Sin nombre'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{card.clientPhone}</p>
                    </div>
                    {!isDragging && onDelete && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0 text-base leading-none"
                        >
                            ×
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {format(localStart, "dd MMM · HH:mm", { locale: es })}
                </div>

                <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 font-normal">
                        <Wrench className="h-2.5 w-2.5 mr-0.5" />
                        {card.teamService.name}
                    </Badge>
                    {card.teamMember.color ? (
                        <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1.5 py-0 font-normal"
                            style={{ borderColor: card.teamMember.color + '80', color: card.teamMember.color, backgroundColor: card.teamMember.color + '15' }}
                        >
                            {card.teamMember.name}
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0 font-normal">
                            {card.teamMember.name}
                        </Badge>
                    )}
                </div>
            </div>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar cita</AlertDialogTitle>
                        <AlertDialogDescription>
                            ¿Deseas eliminar la cita de {card.clientName}? Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                            {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

// ─── Draggable wrapper ────────────────────────────────────────────────────────

function DraggableCard({ card, onDelete }: { card: BookingCard; onDelete: (id: string) => void }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: card.id,
        data: { card },
    });

    const style = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, position: 'relative' as const }
        : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
            <BookingCardItem card={card} isDragging={isDragging} onDelete={onDelete} />
        </div>
    );
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

function BookingColumn({ col, cards, onDelete, userId }: {
    col: (typeof COLUMNS)[number];
    cards: BookingCard[];
    onDelete: (id: string) => void;
    userId: string;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: col.id });
    const [automationsOpen, setAutomationsOpen] = useState(false);

    return (
        <div
            className="flex flex-col min-w-[260px] w-[260px] shrink-0 rounded-xl border-2 overflow-hidden shadow-sm h-full"
            style={{ borderColor: col.borderColor + '52', backgroundColor: col.borderColor + '0A' }}
        >
            <div className={cn('px-3 py-2 flex items-center justify-between shrink-0', col.headerClass)}>
                <span className="text-white text-sm font-semibold uppercase">{col.label}</span>
                <div className="flex items-center gap-1">
                    <Badge className="bg-white/20 text-white border-0 text-xs font-medium">{cards.length}</Badge>
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
                        <SheetTitle>Automaciones — {col.label}</SheetTitle>
                    </SheetHeader>
                    <ApptAutomationsPanel userId={userId} apptStatus={col.id} />
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
                    <DraggableCard key={card.id} card={card} onDelete={onDelete} />
                ))}
                {cards.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/40">
                        Sin citas
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Kanban ──────────────────────────────────────────────────────────────

export function BookingsKanban({ teamId, userId, onStatusCountsChange }: {
    teamId: string;
    userId: string;
    onStatusCountsChange?: (counts: { status: any; count: number }[]) => void;
}) {
    const [cards, setCards] = useState<BookingCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCard, setActiveCard] = useState<BookingCard | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getBookingAppointments(teamId);
        if (res.success && res.data) {
            const data = res.data as BookingCard[];
            setCards(data);
            if (onStatusCountsChange) {
                const counts: Record<string, number> = {};
                for (const c of data) counts[c.status] = (counts[c.status] ?? 0) + 1;
                onStatusCountsChange(Object.entries(counts).map(([status, count]) => ({ status, count })));
            }
        } else {
            toast.error(res.message);
        }
        setLoading(false);
    }, [teamId]);

    useEffect(() => { load(); }, [load]);

    // Servicios únicos para filtro
    const allServices = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of cards) map.set(c.teamService.name, c.teamService.name);
        return Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'es'));
    }, [cards]);

    const toggleService = (name: string) => {
        setSelectedServices((prev) => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });
    };

    const filteredCards = useMemo(() => {
        let result = cards;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter((c) =>
                (c.clientName ?? '').toLowerCase().includes(q) ||
                (c.clientPhone ?? '').toLowerCase().includes(q) ||
                c.teamService.name.toLowerCase().includes(q)
            );
        }
        if (selectedServices.size > 0) {
            result = result.filter((c) => selectedServices.has(c.teamService.name));
        }
        return result;
    }, [cards, searchQuery, selectedServices]);

    const handleDelete = (id: string) => {
        setCards((prev) => prev.filter((c) => c.id !== id));
    };

    const onDragStart = (e: DragStartEvent) => {
        const card = filteredCards.find((c) => c.id === e.active.id);
        setActiveCard(card ?? null);
    };

    const onDragEnd = async (e: DragEndEvent) => {
        setActiveCard(null);
        const { active, over } = e;
        if (!over) return;

        const cardId = active.id as string;
        const newStatus = over.id as AppointmentStatus;
        const card = cards.find((c) => c.id === cardId);
        if (!card || card.status === newStatus) return;

        setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, status: newStatus } : c)));
        const res = await updateBookingAppointmentStatus(cardId, newStatus);
        if (!res.success) {
            toast.error(res.message);
            setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, status: card.status } : c)));
        } else {
            toast.success(`Cita movida a ${STATUS_LABELS[newStatus]}`);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const isFiltered = searchQuery || selectedServices.size > 0;

    return (
        <TooltipProvider delayDuration={120}>
            <div className="flex flex-col gap-3 min-w-0 w-full h-full">
                <div className="flex flex-col gap-3 min-w-0 w-full flex-1 min-h-0">

                    {/* Toolbar */}
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        {/* Buscador */}
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

                        {/* Filtro por servicio */}
                        {allServices.length > 1 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 pb-0.5">
                                <Wrench className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                {allServices.map((name) => {
                                    const active = selectedServices.has(name);
                                    return (
                                        <button
                                            key={name}
                                            type="button"
                                            onClick={() => toggleService(name)}
                                            className={cn(
                                                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all shrink-0 text-foreground border-border',
                                                active ? 'bg-primary/10 border-primary/50 text-primary shadow-sm' : 'opacity-70 hover:opacity-100',
                                            )}
                                        >
                                            {name}
                                            {active && <X className="h-2.5 w-2.5 ml-0.5" />}
                                        </button>
                                    );
                                })}
                                {selectedServices.size > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedServices(new Set())}
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

                        {/* Total + refresh */}
                        <div className="flex items-center gap-2 shrink-0 ml-auto">
                            <span className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                                <Clock className="h-3.5 w-3.5" />
                                <span className="font-medium text-foreground">
                                    {isFiltered ? `${filteredCards.length}/${cards.length}` : cards.length}
                                </span>
                            </span>
                            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={load} title="Actualizar">
                                <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>

                    {/* Board */}
                    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                        <div className="relative flex-1 min-h-0">
                            <div className="pointer-events-none absolute right-0 top-0 bottom-3 w-8 bg-gradient-to-l from-card/80 to-transparent z-10 sm:hidden" />
                            <div className="overflow-x-auto w-full h-full pb-3" style={{ minHeight: 0 }}>
                                <div className="flex gap-3 h-full" style={{ width: 'max-content', minWidth: '100%' }}>
                                    {COLUMNS.map((col) => (
                                        <BookingColumn
                                            key={col.id}
                                            col={col}
                                            cards={filteredCards.filter((c) => c.status === col.id)}
                                            onDelete={handleDelete}
                                            userId={userId}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <DragOverlay>
                            {activeCard && (
                                <div className="w-[224px] rotate-2 shadow-2xl">
                                    <BookingCardItem card={activeCard} isDragging />
                                </div>
                            )}
                        </DragOverlay>
                    </DndContext>
                </div>
            </div>
        </TooltipProvider>
    );
}
