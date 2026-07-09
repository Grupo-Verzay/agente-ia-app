'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  RefreshCw, Trash2, Eye, Download, Search,
  CheckCircle2, Clock, Filter, User, Phone, CalendarClock, Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ModuleToolbar } from '@/components/shared/ModuleToolbar';
import { themeClass } from '@/types/generic';
import {
  getBookingFormResponses, deleteBookingFormResponse,
  type BookingResponseRow,
} from '@/actions/booking-form-actions';

export type BookingResponseCounts = {
  total: number;
  synced: number;
  pending: number;
  recent: number;
};

interface Props {
  userId: string;
  /** Sube los conteos a la fila de métricas superior de MainSchedule. */
  onCountsChange?: (counts: BookingResponseCounts) => void;
}

function computeCounts(rows: BookingResponseRow[]): BookingResponseCounts {
  const synced = rows.filter((r) => r.syncedToSheets).length;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = rows.filter((r) => new Date(r.createdAt).getTime() >= weekAgo).length;
  return { total: rows.length, synced, pending: rows.length - synced, recent };
}

const STATUS_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADA: 'Confirmada',
  ATENDIDA: 'Atendida',
  NO_ASISTIDA: 'No asistida',
  CANCELADA: 'Cancelada',
  FINALIZADO: 'Finalizado',
  DESCARTADO: 'Descartado',
};

function fmtDateTime(iso: string | null, timezone?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      timeZone: timezone || 'America/Bogota',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return new Date(iso).toLocaleString('es-CO');
  }
}

export function BookingFormResponsesList({ userId, onCountsChange }: Props) {
  const [rows, setRows] = useState<BookingResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [viewRow, setViewRow] = useState<BookingResponseRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const indexed = rows.map((row, idx) => ({ row, num: rows.length - idx }));
    const q = query.trim().toLowerCase();
    if (!q) return indexed;
    return indexed.filter(({ row }) =>
      [row.clientName, row.clientPhone, row.serviceName, ...row.answers.map((a) => a.answer)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getBookingFormResponses(userId);
    setRows(data);
    setLoading(false);
    onCountsChange?.(computeCounts(data));
  }, [userId, onCountsChange]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await deleteBookingFormResponse(deleteId);
    setDeleteId(null);
    if (!res.success) return toast.error('No se pudo eliminar el registro.');
    toast.success('Registro eliminado');
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== deleteId);
      onCountsChange?.(computeCounts(next));
      return next;
    });
  };

  const handleExportCSV = () => {
    if (!rows.length) return toast.error('No hay registros para exportar');
    const answerLabels = Array.from(
      new Set(rows.flatMap((r) => r.answers.map((a) => a.label))),
    );
    const headers = ['Fecha registro', 'Nombre', 'WhatsApp', 'Fecha cita', 'Servicio', 'Estado cita', 'Sincronizado', ...answerLabels];
    const csvRows = rows.map((r) => {
      const byLabel = new Map(r.answers.map((a) => [a.label, a.answer]));
      return [
        fmtDateTime(r.createdAt),
        r.clientName,
        r.clientPhone,
        fmtDateTime(r.appointmentStart, r.appointmentTimezone),
        r.serviceName ?? '',
        r.status ? (STATUS_LABEL[r.status] ?? r.status) : '',
        r.syncedToSheets ? 'Sí' : 'No',
        ...answerLabels.map((l) => byLabel.get(l) ?? ''),
      ];
    });
    const csv = [headers, ...csvRows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'registros-agendamiento.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">

      {/* Header sticky */}
      <div className={`sticky top-0 z-10 mb-2 ${themeClass}`}>
        <div className="flex flex-col overflow-hidden justify-between flex-1 gap-2">

          {/* Toolbar (las métricas viven en la fila superior de MainSchedule) */}
          <ModuleToolbar className="shrink-0">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, número o nombre..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8"
              />
            </div>
            <div className="toolbar-collapse flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleExportCSV}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Exportar CSV
              </Button>
            </div>
          </ModuleToolbar>

        </div>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="pb-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Cargando registros…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <div className="p-3 rounded-full bg-muted">
                <Filter className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Sin registros aún</p>
              <p className="text-sm text-muted-foreground">Los registros aparecerán aquí cuando alguien llene el formulario de agendamiento.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <div className="p-3 rounded-full bg-muted">
                <Search className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Sin resultados</p>
              <p className="text-sm text-muted-foreground">No hay registros que coincidan con “{query}”.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map(({ row, num }) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Ícono de estado de sync */}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white ${row.syncedToSheets ? 'bg-green-500' : 'bg-yellow-400'}`}>
                    {row.syncedToSheets ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                  </div>

                  {/* Info principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{row.clientName || 'Sin nombre'}</span>
                      <Badge variant={row.syncedToSheets ? 'default' : 'secondary'} className="text-xs py-0 h-4">
                        {row.syncedToSheets ? 'Sincronizado' : 'Pendiente'}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">#{num}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-2">
                      {row.clientPhone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{row.clientPhone}</span>}
                      {row.appointmentStart && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />{fmtDateTime(row.appointmentStart, row.appointmentTimezone)}</span>}
                      {row.serviceName && <span className="inline-flex items-center gap-1"><Wrench className="w-3 h-3" />{row.serviceName}</span>}
                    </p>
                  </div>

                  {/* Fecha registro */}
                  <span className="text-xs text-muted-foreground shrink-0 hidden md:block" suppressHydrationWarning>
                    {fmtDateTime(row.createdAt)}
                  </span>

                  {/* Acciones */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewRow(row)} title="Ver detalle">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(row.id)} title="Eliminar">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialog: Ver registro */}
      <Dialog open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <DialogContent className="flex max-h-[585px] flex-col sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Detalle del registro</DialogTitle>
          </DialogHeader>
          {viewRow && (
            <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto pr-1">
              {/* Datos del cliente / cita */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1"><User className="w-3 h-3" />Nombre</span>
                  <span className="text-sm">{viewRow.clientName || <em className="text-muted-foreground">Sin nombre</em>}</span>
                </div>
                <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Phone className="w-3 h-3" />WhatsApp</span>
                  <span className="text-sm">{viewRow.clientPhone || <em className="text-muted-foreground">—</em>}</span>
                </div>
                <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1"><CalendarClock className="w-3 h-3" />Fecha de la cita</span>
                  <span className="text-sm">{fmtDateTime(viewRow.appointmentStart, viewRow.appointmentTimezone)}</span>
                </div>
                <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Wrench className="w-3 h-3" />Servicio</span>
                  <span className="text-sm">{viewRow.serviceName || <em className="text-muted-foreground">—</em>}</span>
                </div>
              </div>

              {/* Respuestas del formulario */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Respuestas del formulario</span>
                {viewRow.answers.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1">Este registro no tiene respuestas de formulario.</p>
                ) : (
                  viewRow.answers.map((a, idx) => (
                    <div key={`${a.questionId}-${idx}`} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{a.label}</span>
                      <span className="text-sm">{a.answer !== '' ? a.answer : <em className="text-muted-foreground">Sin respuesta</em>}</span>
                    </div>
                  ))
                )}
              </div>

              <p className="text-xs text-muted-foreground px-1" suppressHydrationWarning>
                Registrado: {fmtDateTime(viewRow.createdAt)}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Alert: Eliminar */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. La cita asociada no se elimina, solo el registro del formulario.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
