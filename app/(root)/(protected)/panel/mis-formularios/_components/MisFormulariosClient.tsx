'use client';

import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  FileText, BarChart2, ExternalLink, Pencil, Trash2, Copy, Check,
  ToggleLeft, ToggleRight, MoreVertical, FormInput, CheckCircle2, XCircle,
  ClipboardList, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { MetricCard } from '@/components/custom/MetricCard';
import { ModuleToolbar } from '@/components/shared/ModuleToolbar';
import { themeClass } from '@/types/generic';
import { createForm, deleteForm, updateForm, getMyForms, type FormData } from '@/actions/forms-actions';

interface Props {
  initialForms: FormData[];
  userId: string;
}

export function MisFormulariosClient({ initialForms, userId }: Props) {
  const [forms, setForms] = useState<FormData[]>(initialForms);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [sheetsUrl, setSheetsUrl] = useState('');

  const totalForms = forms.length;
  const activeForms = forms.filter((f) => f.isActive).length;
  const inactiveForms = forms.filter((f) => !f.isActive).length;
  const totalSubmissions = forms.reduce((acc, f) => acc + (f._count?.submissions ?? 0), 0);

  const filteredForms = useMemo(() => {
    if (!search.trim()) return forms;
    const q = search.toLowerCase();
    return forms.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.slug.toLowerCase().includes(q) ||
        (f.description ?? '').toLowerCase().includes(q),
    );
  }, [forms, search]);

  const refresh = useCallback(async () => {
    const res = await getMyForms();
    if (res.success) setForms(res.forms ?? []);
  }, []);

  const handleTitleChange = (v: string) => {
    setTitle(v);
    setSlug(v.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
  };

  const handleCreate = async () => {
    if (!title.trim() || !slug.trim()) return toast.error('Título y slug son requeridos');
    setSaving(true);
    const res = await createForm({ title, slug, description, sheetsUrl });
    setSaving(false);
    if (!res.success) return toast.error(res.error ?? 'Error al crear formulario');
    toast.success('Formulario creado');
    setCreateOpen(false);
    setTitle(''); setSlug(''); setDescription(''); setSheetsUrl('');
    await refresh();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await deleteForm(deleteId);
    setDeleteId(null);
    if (!res.success) return toast.error(res.error ?? 'Error al eliminar');
    toast.success('Formulario eliminado');
    await refresh();
  };

  const handleToggleActive = async (form: FormData) => {
    const res = await updateForm(form.id, { isActive: !form.isActive });
    if (!res.success) return toast.error(res.error ?? 'Error');
    toast.success(form.isActive ? 'Formulario desactivado' : 'Formulario activado');
    await refresh();
  };

  const handleCopyLink = async (form: FormData) => {
    const url = `${window.location.origin}/f/${userId}/${form.slug}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(form.id);
    toast.success('Enlace copiado');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col h-full">

      {/* Header fijo */}
      <div className={`sticky top-0 z-10 mb-2 ${themeClass}`}>
        <div className="flex flex-col overflow-hidden justify-between flex-1 gap-2">

          {/* MetricCards */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <div className="min-w-0">
              <MetricCard label="Total formularios" value={totalForms} icon={<FormInput className="h-4 w-4" />} color="#3B82F6" />
            </div>
            <div className="min-w-0">
              <MetricCard label="Activos" value={activeForms} icon={<CheckCircle2 className="h-4 w-4" />} color="#22C55E" />
            </div>
            <div className="min-w-0">
              <MetricCard label="Inactivos" value={inactiveForms} icon={<XCircle className="h-4 w-4" />} color="#6B7280" />
            </div>
            <div className="min-w-0">
              <MetricCard label="Total registros" value={totalSubmissions} icon={<ClipboardList className="h-4 w-4" />} color="#8B5CF6" />
            </div>
          </div>

          {/* Toolbar: buscador + botón */}
          <ModuleToolbar className="shrink-0">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar formularios..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                + Nuevo formulario
              </Button>
            </div>
          </ModuleToolbar>

        </div>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto">

        {/* Empty state */}
        {forms.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="p-4 rounded-full bg-muted">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Aún no tienes formularios</p>
              <p className="text-sm text-muted-foreground mt-1">Crea tu primer formulario para empezar a capturar registros.</p>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
              + Nuevo formulario
            </Button>
          </div>
        )}

        {/* Sin resultados de búsqueda */}
        {forms.length > 0 && filteredForms.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-8">
            No se encontraron formularios para &quot;{search}&quot;.
          </p>
        )}

        {/* Grid de formularios */}
        {filteredForms.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredForms.map((form) => (
              <Card key={form.id} className="flex flex-col overflow-hidden">
                <div className={`h-1 w-full ${form.isActive ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : 'bg-muted'}`} />
                <CardContent className="flex flex-col gap-3 p-4 flex-1">

                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base truncate">{form.title}</h3>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                        /f/{userId.slice(0, 8)}.../{form.slug}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant={form.isActive ? 'default' : 'secondary'} className="text-xs shrink-0">
                        {form.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleCopyLink(form)}>
                            {copiedId === form.id
                              ? <><Check className="w-4 h-4 mr-2 text-green-500" /> Copiado</>
                              : <><Copy className="w-4 h-4 mr-2" /> Copiar enlace</>}
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={`/f/${userId}/${form.slug}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Ver formulario
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleToggleActive(form)}>
                            {form.isActive
                              ? <><ToggleLeft className="w-4 h-4 mr-2" /> Desactivar</>
                              : <><ToggleRight className="w-4 h-4 mr-2 text-green-600" /> Activar</>}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteId(form.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Description */}
                  {form.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{form.description}</p>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-auto pt-2 border-t border-border">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      {form.fields.length} campos
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BarChart2 className="w-3.5 h-3.5" />
                      {form._count?.submissions ?? 0} registros
                    </span>
                  </div>

                  {/* Primary actions */}
                  <div className="flex gap-2">
                    <Button asChild size="sm" className="flex-1">
                      <Link href={`/panel/mis-formularios/${form.id}`}>
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />
                        Editar
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <Link href={`/panel/mis-formularios/${form.id}/registros`}>
                        <BarChart2 className="w-3.5 h-3.5 mr-1.5" />
                        Registros
                      </Link>
                    </Button>
                  </div>

                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog: Crear formulario */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Nuevo formulario</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="form-title">Título *</Label>
              <Input
                id="form-title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="ej. Registro de clientes"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="form-slug">Slug (URL) *</Label>
              <Input
                id="form-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="ej. registro-clientes"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                URL pública: /f/{userId.slice(0, 8)}.../{slug || 'mi-formulario'}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="form-desc">Descripción</Label>
              <Textarea
                id="form-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe el propósito del formulario..."
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="form-sheets">Google Sheets URL</Label>
              <Input
                id="form-sheets"
                value={sheetsUrl}
                onChange={(e) => setSheetsUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />
              <p className="text-xs text-muted-foreground">Los registros se sincronizarán automáticamente.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creando...' : 'Crear formulario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert: Eliminar */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar formulario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán el formulario y todos sus registros. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
