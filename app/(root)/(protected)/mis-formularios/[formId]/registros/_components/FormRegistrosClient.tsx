'use client';

import { useState, useCallback, useRef } from 'react';
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
import { PastillasDeMetricas } from '@/components/shared/PastillasDeMetricas';
import { ModuleToolbar } from '@/components/shared/ModuleToolbar';
import { themeClass } from '@/types/generic';
import {
  getFormSubmissions, deleteFormSubmission, retrySheetSync,
  type ConteosDeRegistros, type FormData, type FormSubmissionData,
} from '@/actions/forms-actions';
import { AccionesMasivas } from '@/components/shared/AccionesMasivas';
import { comoSeLeeLaRespuesta, elResumenDelRegistro, type FiltroDeSincronizacion } from '@/lib/formularios';

interface Props {
  form: FormData;
  initialSubmissions: FormSubmissionData[];
  /** Las cuatro cifras de arriba, contadas en el servidor (la lista trae como mucho 500). */
  initialConteos: ConteosDeRegistros | null;
}

/** Una respuesta que es un enlace (un archivo subido) se abre, no se lee. */
function Respuesta({ valor }: { valor: unknown }) {
  const texto = comoSeLeeLaRespuesta(valor);
  if (!texto.trim()) return <em className="text-muted-foreground">Sin respuesta</em>;
  if (/^https?:\/\//i.test(texto)) {
    return (
      <a href={texto} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400">
        {texto}
      </a>
    );
  }
  return <span className="whitespace-pre-wrap break-words">{texto}</span>;
}

const SYNC_BADGE: Record<string, { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  SYNCED:  { label: 'Sincronizado', icon: <CheckCircle2 className="w-3 h-3" />, variant: 'default' },
  PENDING: { label: 'Pendiente',    icon: <Clock className="w-3 h-3" />,         variant: 'secondary' },
  ERROR:   { label: 'Error',        icon: <AlertCircle className="w-3 h-3" />,   variant: 'destructive' },
};

export function FormRegistrosClient({ form, initialSubmissions, initialConteos }: Props) {
  const [submissions, setSubmissions] = useState<FormSubmissionData[]>(initialSubmissions);
  const [conteos, setConteos] = useState<ConteosDeRegistros | null>(initialConteos);
  const [viewSub, setViewSub]   = useState<FormSubmissionData | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  // Las cuatro pastillas FILTRAN la lista, en el servidor (ver getFormSubmissions).
  const [estado, setEstado]     = useState<FiltroDeSincronizacion>('todos');
  const estadoRef = useRef<FiltroDeSincronizacion>('todos');

  // Un contador es un COUNT, no un `length`: la lista trae como mucho 500
  // registros y las cifras de arriba tienen que decir cuántos hay de verdad.
  // Sin conteos del servidor (un fallo) se cuentan los cargados.
  const total   = conteos?.total ?? submissions.length;
  const synced  = conteos?.sincronizados ?? submissions.filter((s) => s.syncStatus === 'SYNCED').length;
  const pending = conteos?.pendientes ?? submissions.filter((s) => s.syncStatus === 'PENDING').length;
  const errors  = conteos?.conError ?? submissions.filter((s) => s.syncStatus === 'ERROR').length;

  const refresh = useCallback(async (nuevo?: FiltroDeSincronizacion) => {
    const filtro = nuevo ?? estadoRef.current;
    estadoRef.current = filtro;
    setEstado(filtro);
    setLoading(true);
    const res = await getFormSubmissions(form.id, filtro);
    setLoading(false);
    // Una respuesta de un filtro que ya no es el puesto no pinta encima.
    if (filtro !== estadoRef.current) return;
    if (res.success) {
      setSubmissions(res.submissions ?? []);
      setConteos(res.conteos ?? null);
    } else {
      toast.error(res.error ?? 'No se pudieron cargar los registros');
    }
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
      ...fields.map((f) => comoSeLeeLaRespuesta((s.data as Record<string, unknown>)[f.id])),
      s.syncStatus,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `registros-${form.slug}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const dataPreview = (data: Record<string, unknown>) => elResumenDelRegistro(form.fields, data) || 'Sin respuestas';

  return (
    <div className="flex flex-col h-full">

      {/* Header sticky */}
      <div className={`sticky top-0 z-10 mb-2 ${themeClass}`}>
        <div className="flex flex-col overflow-hidden justify-between flex-1 gap-2">

          {/* Toolbar */}
          <ModuleToolbar
            className="shrink-0"
            secundarias={
              /* Refrescar no acota la lista ni añade una fila: va en el hueco
                 de las secundarias, no en el del botón de crear. */
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => refresh()} disabled={loading} title="Actualizar" aria-label="Actualizar">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            }
            acciones={
              <AccionesMasivas
                seleccionados={[]}
                queSon="registros"
                extras={[{
                  clave: 'csv',
                  etiqueta: 'Exportar CSV',
                  icono: <Download className="h-4 w-4" />,
                  sinSeleccion: true,
                  onSelect: handleExportCSV,
                }]}
              />
            }
          >
            <div className="flex min-w-0 shrink-0 items-center gap-2">
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
            <div className="toolbar-collapse flex items-center gap-2 shrink-0">
              {/* Las cuatro cifras SON el filtro de la lista (en el servidor),
                  y van también en el teléfono: es la única forma de ver solo
                  los que fallaron en Google Sheets. */}
              <PastillasDeMetricas
                enElTelefono
                metricas={[
                  { clave: 'total', icono: <ClipboardList />, etiqueta: 'Todos los registros', valor: total, color: '#3B82F6', alPulsar: () => refresh('todos'), activa: estado === 'todos' },
                  { clave: 'synced', icono: <CheckCircle2 />, etiqueta: 'Sincronizados', valor: synced, color: '#22C55E', alPulsar: () => refresh('SYNCED'), activa: estado === 'SYNCED' },
                  { clave: 'pending', icono: <Clock />, etiqueta: 'Pendientes', valor: pending, color: '#EAB308', alPulsar: () => refresh('PENDING'), activa: estado === 'PENDING' },
                  { clave: 'errors', icono: <AlertCircle />, etiqueta: 'Con error', valor: errors, color: '#EF4444', alPulsar: () => refresh('ERROR'), activa: estado === 'ERROR' },
                ]}
              />
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
              <p className="font-medium">{estado === 'todos' ? 'Sin registros aún' : 'Ningún registro con este estado'}</p>
              <p className="text-sm text-muted-foreground">
                {estado === 'todos'
                  ? 'Los registros aparecerán aquí cuando alguien llene tu formulario.'
                  : 'Pulsa la primera cifra de la barra para ver todos.'}
              </p>
            </div>
          ) : (
            <div data-lista-de-registros className="flex flex-col gap-2">
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
                    data-registro={sub.numero ?? total - i}
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
                      {/* El número va primero: todas las filas son del mismo
                          formulario, y repetir su título en cada una no decía nada. */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">Registro #{sub.numero ?? total - i}</span>
                        <Badge variant={sync.variant} className="text-xs py-0 h-4">{sync.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{dataPreview(sub.data)}</p>
                      {sub.syncStatus === 'ERROR' && sub.syncError && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate" title={sub.syncError}>
                          Google Sheets: {sub.syncError}
                        </p>
                      )}
                    </div>

                    {/* Fecha */}
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:block" suppressHydrationWarning>
                      {new Date(sub.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                    </span>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewSub(sub)} title="Ver detalle" aria-label="Ver detalle">
                        <Eye className="w-4 h-4" />
                      </Button>
                      {sub.syncStatus !== 'SYNCED' && form.sheetsUrl && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRetry(sub.id)} title="Reintentar en Google Sheets" aria-label="Reintentar en Google Sheets">
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(sub.id)} title="Eliminar registro" aria-label="Eliminar registro">
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
        <DialogContent className="flex flex-col sm:max-w-[560px]">
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
                    <span className="text-sm"><Respuesta valor={val} /></span>
                  </div>
                );
              })}
              {Object.entries(viewSub.data as Record<string, unknown>)
                .filter(([key]) => !form.fields.some((f) => f.id === key))
                .map(([key, val]) => (
                  <div key={key} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border">
                    {/* La respuesta de un campo que ya se borró: se conserva,
                        pero su clave es un id y no dice nada. */}
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Campo eliminado</span>
                    <span className="text-sm"><Respuesta valor={val} /></span>
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
