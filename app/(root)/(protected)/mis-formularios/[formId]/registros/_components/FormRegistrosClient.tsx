'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft, RefreshCw, Trash2, Eye, Download,
  CheckCircle2, Clock, AlertCircle, ClipboardList, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import Link from 'next/link';
import { MetricCard } from '@/components/custom/MetricCard';
import { ModuleToolbar } from '@/components/shared/ModuleToolbar';
import { themeClass } from '@/types/generic';
import {
  getFormSubmissions, deleteFormSubmission, retrySheetSync,
  type FormData, type FormSubmissionData,
} from '@/actions/forms-actions';

interface Props {
  form: FormData;
  initialSubmissions: FormSubmissionData[];
}

const SYNC_BADGE: Record<string, { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  SYNCED:  { label: 'Sincronizado', icon: <CheckCircle2 className="w-3 h-3" />, variant: 'default' },
  PENDING: { label: 'Pendiente',    icon: <Clock className="w-3 h-3" />,         variant: 'secondary' },
  ERROR:   { label: 'Error',        icon: <AlertCircle className="w-3 h-3" />,   variant: 'destructive' },
};

export function FormRegistrosClient({ form, initialSubmissions }: Props) {
  const [submissions, setSubmissions] = useState<FormSubmissionData[]>(initialSubmissions);
  const [viewSub, setViewSub]   = useState<FormSubmissionData | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const total   = submissions.length;
  const synced  = submissions.filter((s) => s.syncStatus === 'SYNCED').length;
  const pending = submissions.filter((s) => s.syncStatus === 'PENDING').length;
  const errors  = submissions.filter((s) => s.syncStatus === 'ERROR').length;

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await getFormSubmissions(form.id);
    setLoading(false);
    if (res.success) setSubmissions(res.submissions ?? []);
  }, [form.id]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await deleteFormSubmission(deleteId);
    setDeleteId(null);
    if (!res.success) return toast.error(res.error ?? 'Error');
    toast.success('Registro eliminado');
    await refresh();
  };

  const handleRetry = async (id: string) => {
    const res = await retrySheetSync(id);
    if (!res.success) return toast.error(res.error ?? 'Error al sincronizar');
    toast.success('Sincronizado correctamente');
    await refresh();
  };

  const handleExportCSV = () => {
    if (!submissions.length) return toast.error('No hay registros para exportar');
    const fields = form.fields;
    const headers = ['ID', 'Fecha', ...fields.map((f) => f.label), 'Estado Sync'];
    const rows = submissions.map((s) => [
      s.id,
      new Date(s.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
      ...fields.map((f) => String((s.data as Record<string, unknown>)[f.id] ?? '')),
      s.syncStatus,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `registros-${form.slug}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const dataPreview = (data: Record<string, unknown>) => {
    const vals = Object.values(data).slice(0, 3).map(String).filter(Boolean);
    return vals.join(' | ') + (Object.keys(data).length > 3 ? ' | ...' : '');
  };

  return (
    <div className="flex flex-col h-full">

      {/* Header sticky */}
      <div className={`sticky top-0 z-10 mb-2 ${themeClass}`}>
        <div className="flex flex-col overflow-hidden justify-between flex-1 gap-2">

          {/* MetricCards */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <div className="min-w-0">
              <MetricCard label="Total registros" value={total} icon={<ClipboardList className="h-4 w-4" />} color="#3B82F6" />
            </div>
            <div className="min-w-0">
              <MetricCard label="Sincronizados" value={synced} icon={<CheckCircle2 className="h-4 w-4" />} color="#22C55E" />
            </div>
            <div className="min-w-0">
              <MetricCard label="Pendientes" value={pending} icon={<Clock className="h-4 w-4" />} color="#EAB308" />
            </div>
            <div className="min-w-0">
              <MetricCard label="Con error" value={errors} icon={<AlertCircle className="h-4 w-4" />} color="#EF4444" />
            </div>
          </div>

          {/* Toolbar */}
          <ModuleToolbar className="shrink-0">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href={`/mis-formularios/${form.id}`}>
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  Volver
                </Link>
              </Button>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">Registros — {form.title}</p>
                <p className="text-xs text-muted-foreground truncate">Respuestas recibidas en este formulario</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
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
        <div className="p-3">
          {submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <div className="p-3 rounded-full bg-muted">
                <Filter className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Sin registros aún</p>
              <p className="text-sm text-muted-foreground">Los registros aparecerán aquí cuando alguien llene tu formulario.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {submissions.map((sub, i) => {
                const sync = SYNC_BADGE[sub.syncStatus] ?? SYNC_BADGE.PENDING;
                const syncColor = {
                  SYNCED:  'bg-green-500',
                  PENDING: 'bg-yellow-400',
                  ERROR:   'bg-red-500',
                }[sub.syncStatus] ?? 'bg-gray-400';

                return (
                  <div
                    key={sub.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-sm hover:shadow-md transition-shadow"
                  >
                    {/* Ícono de estado */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${syncColor} text-white`}>
                      {sync.variant === 'default'      && <CheckCircle2 className="h-5 w-5" />}
                      {sync.variant === 'secondary'    && <Clock className="h-5 w-5" />}
                      {sync.variant === 'destructive'  && <AlertCircle className="h-5 w-5" />}
                    </div>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{sub.formTitle}</span>
                        <Badge variant={sync.variant} className="text-xs py-0 h-4">{sync.label}</Badge>
                        <span className="text-xs font-mono text-muted-foreground">#{submissions.length - i}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{dataPreview(sub.data)}</p>
                    </div>

                    {/* Fecha */}
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:block" suppressHydrationWarning>
                      {new Date(sub.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                    </span>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewSub(sub)} title="Ver detalle">
                        <Eye className="w-4 h-4" />
                      </Button>
                      {sub.syncStatus !== 'SYNCED' && form.sheetsUrl && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRetry(sub.id)} title="Reintentar sync">
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(sub.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dialog: Ver registro */}
      <Dialog open={!!viewSub} onOpenChange={(o) => !o && setViewSub(null)}>
        <DialogContent className="flex h-[585px] flex-col sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Detalle del registro</DialogTitle>
          </DialogHeader>
          {viewSub && (
            <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto pr-1">
              <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                {new Date(viewSub.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
              </p>
              {form.fields.map((field) => {
                const val = (viewSub.data as Record<string, unknown>)[field.id];
                return (
                  <div key={field.id} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{field.label}</span>
                    <span className="text-sm">{val !== undefined && val !== '' ? String(val) : <em className="text-muted-foreground">Sin respuesta</em>}</span>
                  </div>
                );
              })}
              {Object.entries(viewSub.data as Record<string, unknown>)
                .filter(([key]) => !form.fields.some((f) => f.id === key))
                .map(([key, val]) => (
                  <div key={key} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{key}</span>
                    <span className="text-sm">{String(val)}</span>
                  </div>
                ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Alert: Eliminar */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
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
