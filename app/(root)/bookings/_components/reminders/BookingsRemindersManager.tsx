'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    BellRing, CalendarDays, FileAudio, FileText, ImageIcon, Loader2, Paperclip,
    Pencil, Plus, Search, Trash2, Video, Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { TimeInput } from '@/components/shared/TimeInput';
import { getTeamServices, updateTeamService } from '@/actions/bookings-actions';
import TooltipWrapper from '@/components/TooltipWrapper';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceReminder {
    title?: string;
    timeMinutes: number;
    message: string;
    media?: string;
    mediaType?: string;
    nameFile?: string;
}

interface TeamService {
    id: string;
    name: string;
    color: string | null;
    duration: number;
    remindersConfig: ServiceReminder[] | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(mins: number) {
    if (mins < 60) return `${mins} min antes`;
    if (mins < 1440) return `${mins / 60}h antes`;
    return `${mins / 1440}d antes`;
}

function reminderDisplayTitle(rem: ServiceReminder): string {
    if (rem.title?.trim()) return rem.title.trim().toUpperCase();
    if (rem.timeMinutes < 60) return `RECORDATORIO ${rem.timeMinutes} MIN ANTES`;
    if (rem.timeMinutes < 1440) return `RECORDATORIO ${rem.timeMinutes / 60}H ANTES`;
    return `RECORDATORIO ${rem.timeMinutes / 1440}D ANTES`;
}

function minsToTimeInput(mins: number): string {
    if (mins >= 1440 && mins % 1440 === 0) return `days-${mins / 1440}`;
    if (mins >= 60 && mins % 60 === 0) return `hours-${mins / 60}`;
    return `minutes-${mins}`;
}

function timeInputToMins(value: string): number {
    const [unit, numStr] = value.split('-');
    const n = parseInt(numStr, 10) || 0;
    if (unit === 'hours') return n * 60;
    if (unit === 'days') return n * 1440;
    return n;
}

function formatFileSize(bytes: number) {
    if (!bytes) return '0 KB';
    const mb = bytes / 1024 / 1024;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const MEDIA_OPTIONS = [
    { type: 'image',    label: 'Imagen', accept: 'image/*',                                           Icon: ImageIcon,  iconClass: 'text-sky-600'     },
    { type: 'video',    label: 'Video',  accept: 'video/*',                                           Icon: Video,      iconClass: 'text-rose-600'    },
    { type: 'audio',    label: 'Audio',  accept: 'audio/*',                                           Icon: FileAudio,  iconClass: 'text-emerald-600' },
    { type: 'document', label: 'Doc.',   accept: '.pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf',   Icon: FileText,   iconClass: 'text-amber-600'   },
] as const;

type MediaType = (typeof MEDIA_OPTIONS)[number]['type'];

// ─── ReminderFormDialog ───────────────────────────────────────────────────────

interface ReminderFormDialogProps {
    open: boolean;
    initial?: ServiceReminder;
    userId: string;
    onClose: () => void;
    onSave: (r: ServiceReminder) => void;
    saving: boolean;
}

function ReminderFormDialog({ open, initial, userId, onClose, onSave, saving }: ReminderFormDialogProps) {
    const isEdit = Boolean(initial);

    const [title, setTitle]           = useState(initial?.title ?? '');
    const [message, setMessage]       = useState(initial?.message ?? 'Hola @client_name, te recordamos tu cita: @appointment_datetime');
    const [timeValue, setTimeValue]   = useState(minsToTimeInput(initial?.timeMinutes ?? 60));
    const [mediaPreview, setMediaPreview] = useState<{ fileName: string; mimeType: string; size: number; type: MediaType } | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [mediaAccept, setMediaAccept] = useState('image/*');
    const [uploading, setUploading]   = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setTitle(initial?.title ?? '');
            setMessage(initial?.message ?? 'Hola @client_name, te recordamos tu cita: @appointment_datetime');
            setTimeValue(minsToTimeInput(initial?.timeMinutes ?? 60));
            setMediaPreview(null);
            setSelectedFile(null);
        }
    }, [open, initial]);

    const handlePickMedia = (option: (typeof MEDIA_OPTIONS)[number]) => {
        setMediaAccept(option.accept);
        requestAnimationFrame(() => fileInputRef.current?.click());
    };

    const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const detectedType: MediaType =
            file.type.startsWith('image/') ? 'image'
            : file.type.startsWith('video/') ? 'video'
            : file.type.startsWith('audio/') ? 'audio'
            : 'document';
        setMediaPreview({ fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, type: detectedType });
        setSelectedFile(file);
    };

    const clearMedia = () => {
        setMediaPreview(null);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSave = async () => {
        const mins = timeInputToMins(timeValue);
        if (!mins || mins <= 0) { toast.error('Ingresa un tiempo válido'); return; }
        if (!message.trim()) { toast.error('El mensaje no puede estar vacío'); return; }

        let mediaPayload: Pick<ServiceReminder, 'media' | 'mediaType' | 'nameFile'> = {};
        if (selectedFile && mediaPreview) {
            try {
                setUploading(true);
                const fd = new FormData();
                fd.append('file', selectedFile);
                fd.append('userID', userId);
                fd.append('workflowID', 'reminders');
                const res = await fetch('/api/upload', { method: 'POST', body: fd });
                const data = await res.json().catch(() => null);
                if (!res.ok || !data?.url) throw new Error(data?.error || 'No se pudo subir el archivo.');
                mediaPayload = { media: data.url, mediaType: mediaPreview.type, nameFile: selectedFile.name };
            } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Error al subir archivo');
                return;
            } finally {
                setUploading(false);
            }
        }

        const reminder: ServiceReminder = { timeMinutes: mins, message: message.trim() };
        if (title.trim()) reminder.title = title.trim();

        // Preserve existing media if no new file selected
        const existingMedia = initial?.media
            ? { media: initial.media, mediaType: initial.mediaType, nameFile: initial.nameFile }
            : {};
        const finalMedia = Object.keys(mediaPayload).length ? mediaPayload : existingMedia;
        if (finalMedia.media) {
            reminder.media = finalMedia.media;
            if (finalMedia.mediaType) reminder.mediaType = finalMedia.mediaType;
            if (finalMedia.nameFile) reminder.nameFile = finalMedia.nameFile;
        }

        onSave(reminder);
    };

    const isBusy = saving || uploading;

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Editar recordatorio' : 'Crear recordatorio'}</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-1">
                    {/* Título */}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm font-semibold">Título</Label>
                        <Input
                            placeholder="Ej: Recordatorio cita"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    {/* Mensaje */}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm font-semibold">Mensaje</Label>
                        <Textarea
                            placeholder="Hola @client_name, te recordamos que..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="min-h-[72px] max-h-[180px] resize-y text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Variables: @client_name · @appointment_datetime · @appointment_duration
                        </p>
                    </div>

                    {/* Archivo multimedia */}
                    <div className="flex flex-col gap-3 rounded-md border border-dashed border-blue-200 bg-blue-50/30 px-3 py-3">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={mediaAccept}
                            className="hidden"
                            onChange={handleFileSelected}
                        />
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-blue-600 shadow-sm">
                                    <Paperclip className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold leading-none">Archivo multimedia</p>
                                    <p className="mt-1 truncate text-xs text-muted-foreground">Opcional para enviar junto al recordatorio</p>
                                </div>
                            </div>
                            {(mediaPreview || initial?.media) && (
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={clearMedia}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            {MEDIA_OPTIONS.map((opt) => {
                                const Icon = opt.Icon;
                                const active = mediaPreview?.type === opt.type;
                                return (
                                    <Button
                                        key={opt.type}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className={`h-9 gap-1.5 px-2 text-sm font-medium ${active ? 'border-blue-300 bg-blue-100 text-blue-700 hover:bg-blue-100' : 'bg-background hover:border-blue-200 hover:bg-blue-50/60'}`}
                                        onClick={() => handlePickMedia(opt)}
                                    >
                                        <Icon className={`h-4 w-4 ${opt.iconClass}`} />
                                        <span className="truncate">{opt.label}</span>
                                    </Button>
                                );
                            })}
                        </div>

                        {mediaPreview ? (
                            <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    {mediaPreview.type === 'image' ? <ImageIcon className="h-4 w-4" /> :
                                     mediaPreview.type === 'video' ? <Video className="h-4 w-4" /> :
                                     mediaPreview.type === 'audio' ? <FileAudio className="h-4 w-4" /> :
                                     <FileText className="h-4 w-4" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium">{mediaPreview.fileName}</p>
                                    <p className="text-xs text-muted-foreground">{formatFileSize(mediaPreview.size)} · {mediaPreview.mimeType}</p>
                                </div>
                            </div>
                        ) : initial?.media ? (
                            <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    <FileText className="h-4 w-4" />
                                </div>
                                <p className="truncate text-xs font-medium">{initial.nameFile ?? 'Archivo adjunto'}</p>
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">Selecciona una imagen, video, audio o documento.</p>
                        )}
                    </div>

                    {/* Duración de retraso */}
                    <TimeInput
                        currentValue={timeValue}
                        onChange={setTimeValue}
                    />
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>
                        Cancelar
                    </Button>
                    <Button type="button" onClick={handleSave} disabled={isBusy}>
                        {isBusy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        {isEdit ? 'Actualizar recordatorio' : 'Crear recordatorio'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── ServiceSection ───────────────────────────────────────────────────────────

function ServiceSection({
    service,
    search,
    userId,
    onUpdated,
}: {
    service: TeamService;
    search: string;
    userId: string;
    onUpdated: (id: string, reminders: ServiceReminder[]) => void;
}) {
    const [saving, setSaving] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editIdx, setEditIdx] = useState<number | null>(null);

    const reminders: ServiceReminder[] = Array.isArray(service.remindersConfig)
        ? service.remindersConfig
        : [];

    const filteredReminders = (search
        ? reminders.filter((r) => {
            const haystack = `${reminderDisplayTitle(r)} ${fmtTime(r.timeMinutes)} ${r.message}`.toLowerCase();
            return haystack.includes(search.toLowerCase());
          })
        : reminders
    ).slice().sort((a, b) => b.timeMinutes - a.timeMinutes);

    const persist = async (updated: ServiceReminder[]) => {
        setSaving(true);
        const res = await updateTeamService(service.id, { remindersConfig: updated });
        if (res.success) {
            onUpdated(service.id, updated);
            toast.success('Recordatorio guardado');
        } else {
            toast.error(res.message);
        }
        setSaving(false);
    };

    const handleSave = (r: ServiceReminder) => {
        if (editIdx !== null) {
            persist(reminders.map((rem, i) => (i === editIdx ? r : rem)));
        } else {
            persist([...reminders, r]);
        }
        setDialogOpen(false);
        setEditIdx(null);
    };

    const handleDelete = (idx: number) => {
        persist(reminders.filter((_, i) => i !== idx));
    };

    const openAdd = () => { setEditIdx(null); setDialogOpen(true); };
    const openEdit = (idx: number) => { setEditIdx(idx); setDialogOpen(true); };

    if (search && filteredReminders.length === 0) return null;

    return (
        <div className="space-y-2">
            {/* Service header */}
            <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: service.color ?? '#3B82F6' }} />
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    {service.name}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">{service.duration} min</Badge>
                {reminders.length > 0 && (
                    <Badge className="h-4 px-1.5 text-[10px] bg-blue-100 text-blue-700 border-0 shrink-0">
                        <BellRing className="h-2.5 w-2.5 mr-0.5" />
                        {reminders.length}
                    </Badge>
                )}
                <div className="flex-1" />
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={openAdd}
                    disabled={saving}
                >
                    <Plus className="h-3 w-3 mr-0.5" />
                    Agregar
                </Button>
            </div>

            {/* Reminder list */}
            {filteredReminders.length === 0 ? (
                <p className="text-xs text-muted-foreground italic pl-4">
                    Sin recordatorios — se usarán los globales del módulo Recordatorios.
                </p>
            ) : (
                <div className="space-y-1.5 pl-4">
                    {filteredReminders.map((rem) => {
                        const realIdx = reminders.indexOf(rem);
                        return (
                            <Card
                                key={realIdx}
                                className="group w-full rounded-xl border border-border/70 bg-card/90 shadow-sm transition-shadow hover:shadow-md"
                            >
                                <CardContent className="flex items-center gap-3 px-3 py-2.5">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                                        <BellRing className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="app-item-title truncate text-foreground">
                                            {reminderDisplayTitle(rem)}
                                        </h3>
                                        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1 whitespace-nowrap">
                                                <CalendarDays className="h-3 w-3 shrink-0" />
                                                {fmtTime(rem.timeMinutes)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <Badge className="h-5 px-1.5 py-0 text-[10px] font-medium border-0 bg-blue-100 text-blue-700">
                                            Único
                                        </Badge>
                                        {rem.media && (
                                            <Badge className="h-5 px-1.5 py-0 text-[10px] font-medium border-0 bg-sky-100 text-sky-700">
                                                <Paperclip className="h-2.5 w-2.5 mr-0.5" />
                                                Media
                                            </Badge>
                                        )}
                                        <div className="h-5 w-0.5 shrink-0 rounded-full bg-border" />
                                        <div className="flex items-center gap-0.5">
                                            <TooltipWrapper content="Editar">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                                                    onClick={() => openEdit(realIdx)}
                                                    disabled={saving}
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                            </TooltipWrapper>
                                            <TooltipWrapper content="Eliminar">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-600"
                                                    onClick={() => handleDelete(realIdx)}
                                                    disabled={saving}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </TooltipWrapper>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <ReminderFormDialog
                open={dialogOpen}
                initial={editIdx !== null ? reminders[editIdx] : undefined}
                userId={userId}
                onClose={() => { setDialogOpen(false); setEditIdx(null); }}
                onSave={handleSave}
                saving={saving}
            />
        </div>
    );
}

// ─── BookingsRemindersManager ─────────────────────────────────────────────────

export function BookingsRemindersManager({ teamId, userId }: { teamId: string; userId: string }) {
    const [services, setServices] = useState<TeamService[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getTeamServices(teamId);
        if (res.success && res.data) setServices(res.data as TeamService[]);
        else toast.error(res.message);
        setLoading(false);
    }, [teamId]);

    useEffect(() => { load(); }, [load]);

    const handleUpdated = (serviceId: string, reminders: ServiceReminder[]) => {
        setServices((prev) =>
            prev.map((s) => (s.id === serviceId ? { ...s, remindersConfig: reminders } : s))
        );
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-72" />
                {[1, 2].map((i) => (
                    <div key={i} className="space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                ))}
            </div>
        );
    }

    if (services.length === 0) {
        return (
            <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                    <Wrench className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Crea servicios primero en la pestaña Servicios.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar recordatorios..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                    />
                </div>
            </div>

            {/* Per-service sections */}
            {services.map((s) => (
                <ServiceSection
                    key={s.id}
                    service={s}
                    search={search}
                    userId={userId}
                    onUpdated={handleUpdated}
                />
            ))}
        </div>
    );
}
