'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    DndContext, DragEndEvent, DragOverlay, DragStartEvent,
    PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, User, Calendar, Wrench } from 'lucide-react';
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

// ─── Column config (mismo que schedule) ──────────────────────────────────────

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

function BookingCardItem({ card, isDragging = false, onDelete, onStatusChange }: {
    card: BookingCard;
    isDragging?: boolean;
    onDelete?: (id: string) => void;
    onStatusChange?: (id: string, status: AppointmentStatus) => void;
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
                {/* Cliente */}
                <div className="flex items-start gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate leading-tight">{card.clientName || 'Sin nombre'}</p>
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

                {/* Fecha */}
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {format(localStart, "dd MMM · h:mm a", { locale: es })}
                </div>

                {/* Servicio */}
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

function DraggableCard({ card, onDelete, onStatusChange }: {
    card: BookingCard;
    onDelete: (id: string) => void;
    onStatusChange: (id: string, status: AppointmentStatus) => void;
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
            <BookingCardItem card={card} isDragging={isDragging} onDelete={onDelete} onStatusChange={onStatusChange} />
        </div>
    );
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

function BookingColumn({ col, cards, onDelete, onStatusChange }: {
    col: (typeof COLUMNS)[number];
    cards: BookingCard[];
    onDelete: (id: string) => void;
    onStatusChange: (id: string, status: AppointmentStatus) => void;
}) {
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
                    'flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px] transition-colors',
                    isOver && 'bg-white/10',
                )}
            >
                {cards.map((card) => (
                    <DraggableCard key={card.id} card={card} onDelete={onDelete} onStatusChange={onStatusChange} />
                ))}
            </div>
        </div>
    );
}

// ─── Main Kanban ──────────────────────────────────────────────────────────────

export function BookingsKanban({ teamId }: { teamId: string }) {
    const [cards, setCards] = useState<BookingCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCard, setActiveCard] = useState<BookingCard | null>(null);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getBookingAppointments(teamId);
        if (res.success && res.data) setCards(res.data as BookingCard[]);
        else toast.error(res.message);
        setLoading(false);
    }, [teamId]);

    useEffect(() => { load(); }, [load]);

    const handleStatusChange = (id: string, status: AppointmentStatus) => {
        setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    };

    const handleDelete = (id: string) => {
        setCards((prev) => prev.filter((c) => c.id !== id));
    };

    const onDragStart = (e: DragStartEvent) => {
        setActiveCard(e.active.data.current?.card ?? null);
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
            <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const colCards = (status: AppointmentStatus) => cards.filter((c) => c.status === status);

    return (
        <div className="flex flex-col h-full gap-2">
            <div className="flex items-center justify-between shrink-0">
                <p className="text-sm text-muted-foreground">{cards.length} cita{cards.length !== 1 ? 's' : ''} en total</p>
                <Button variant="ghost" size="sm" onClick={load} className="h-7 gap-1 text-xs">
                    <RefreshCw className="h-3 w-3" /> Actualizar
                </Button>
            </div>

            <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                <div className="flex gap-3 overflow-x-auto pb-2 flex-1 min-h-0">
                    {COLUMNS.map((col) => (
                        <BookingColumn
                            key={col.id}
                            col={col}
                            cards={colCards(col.id)}
                            onDelete={handleDelete}
                            onStatusChange={handleStatusChange}
                        />
                    ))}
                </div>

                <DragOverlay>
                    {activeCard && <BookingCardItem card={activeCard} isDragging />}
                </DragOverlay>
            </DndContext>
        </div>
    );
}
