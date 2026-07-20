'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft, Trash2, Save, ExternalLink,
  Settings, Pencil, GripVertical, FileText, MessageCircle,
  ClipboardList, CheckCircle2, XCircle, Wifi, WifiOff, Link2, Check,
} from 'lucide-react';
import {
  DndContext, closestCenter, useSensor, useSensors, PointerSensor,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import Link from 'next/link';
import { MetricCard } from '@/components/custom/MetricCard';
import { ModuleToolbar } from '@/components/shared/ModuleToolbar';
import { themeClass } from '@/types/generic';
import {
  updateForm, addFormField, updateFormField, deleteFormField, reorderFormFields,
  getFormById, updateFormPublicSlug, type FormData, type FormFieldData, type FormFieldOption, type FormFieldType,
} from '@/actions/forms-actions';

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: 'Texto corto',
  textarea: 'Área de texto',
  select: 'Desplegable',
  radio: 'Selección simple',
  multiselect: 'Selección múltiple',
  checkbox: 'Aceptación (casilla)',
  file: 'Archivo / Documento',
  number: 'Número',
  money: 'Monto / Moneda',
  date: 'Fecha',
  time: 'Hora',
  email: 'Correo electrónico',
  phone: 'Teléfono',
  url: 'URL / Enlace',
};

const TYPES_WITH_OPTIONS: FormFieldType[] = ['select', 'radio', 'multiselect'];

const DEFAULT_PLACEHOLDERS: Partial<Record<FormFieldType, string>> = {
  text:     'ej. Juan Pérez',
  textarea: 'Escribe tu respuesta aquí...',
  number:   'ej. 42',
  money:    'ej. 100.000',
  email:    'ej. nombre@correo.com',
  phone:    'ej. +57 300 123 4567',
  url:      'ej. https://mipagina.com',
};

interface Props {
  form: FormData;
  userId: string;
}

export function FormEditorClient({ form: initialForm, userId }: Props) {
  const [form, setForm] = useState<FormData>(initialForm);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<FormFieldData | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingField, setSavingField] = useState(false);
  const [savingActive, setSavingActive] = useState(false);

  const [titleInput, setTitleInput] = useState(form.title);
  const [slugInput, setSlugInput] = useState(form.slug);
  const [descInput, setDescInput] = useState(form.description ?? '');
  const [sheetsInput, setSheetsInput] = useState(form.sheetsUrl ?? '');

  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const [wpEnabled, setWpEnabled] = useState(form.whatsappEnabled);
  const [wpNumber, setWpNumber] = useState(form.whatsappNumber ?? '');
  const [wpMessage, setWpMessage] = useState(form.whatsappMessage ?? '');
  const [savingWp, setSavingWp] = useState(false);

  const [publicSlug, setPublicSlug] = useState(form.publicSlug ?? '');
  const [publicSlugInput, setPublicSlugInput] = useState(form.publicSlug ?? '');
  const [slugSaving, setSlugSaving] = useState(false);

  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<FormFieldType>('text');
  const [newPlaceholder, setNewPlaceholder] = useState('');
  const [newRequired, setNewRequired] = useState(false);
  const [newOptionsRaw, setNewOptionsRaw] = useState('');

  const refresh = useCallback(async () => {
    const res = await getFormById(form.id);
    if (res.success && res.form) {
      setForm(res.form);
      setWpEnabled(res.form.whatsappEnabled);
      setWpNumber(res.form.whatsappNumber ?? '');
      setWpMessage(res.form.whatsappMessage ?? '');
    }
  }, [form.id]);

  const handleToggleActive = async (checked: boolean) => {
    setSavingActive(true);
    const res = await updateForm(form.id, { isActive: checked });
    setSavingActive(false);
    if (!res.success) return toast.error(res.error ?? 'Error al actualizar estado');
    toast.success(checked ? 'Formulario activado' : 'Formulario desactivado');
    setForm((f) => ({ ...f, isActive: checked }));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    const res = await updateForm(form.id, { title: titleInput, slug: slugInput, description: descInput, sheetsUrl: sheetsInput });
    setSaving(false);
    if (!res.success) return toast.error(res.error ?? 'Error al guardar');
    toast.success('Configuración guardada');
    setSettingsOpen(false);
    await refresh();
  };

  const handleSaveWhatsapp = async () => {
    setSavingWp(true);
    const res = await updateForm(form.id, { whatsappEnabled: wpEnabled, whatsappNumber: wpNumber, whatsappMessage: wpMessage });
    setSavingWp(false);
    if (!res.success) return toast.error(res.error ?? 'Error al guardar');
    toast.success('WhatsApp guardado');
    await refresh();
  };

  const handleSavePublicSlug = async () => {
    if (!publicSlugInput.trim()) return;
    setSlugSaving(true);
    const res = await updateFormPublicSlug(form.id, publicSlugInput.trim());
    setSlugSaving(false);
    if (!res.success) return toast.error(res.message ?? 'Error al guardar');
    setPublicSlug(res.slug!);
    toast.success('URL personalizada guardada');
  };

  const parseOptions = (raw: string): FormFieldOption[] =>
    raw.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ label: l, value: l }));

  const resetFieldForm = () => { setNewLabel(''); setNewType('text'); setNewPlaceholder(''); setNewRequired(false); setNewOptionsRaw(''); };

  const handleAddField = async () => {
    if (!newLabel.trim()) return toast.error('El label es requerido');
    setSavingField(true);
    const options = TYPES_WITH_OPTIONS.includes(newType) ? parseOptions(newOptionsRaw) : undefined;
    const res = await addFormField(form.id, { label: newLabel, type: newType, placeholder: newPlaceholder, required: newRequired, options });
    setSavingField(false);
    if (!res.success) return toast.error(res.error ?? 'Error al agregar campo');
    toast.success('Campo agregado');
    setAddFieldOpen(false);
    resetFieldForm();
    await refresh();
  };

  const handleUpdateField = async () => {
    if (!editingField) return;
    setSavingField(true);
    const options = TYPES_WITH_OPTIONS.includes(newType) ? parseOptions(newOptionsRaw) : undefined;
    const res = await updateFormField(editingField.id, { label: newLabel, type: newType, placeholder: newPlaceholder, required: newRequired, options });
    setSavingField(false);
    if (!res.success) return toast.error(res.error ?? 'Error al actualizar campo');
    toast.success('Campo actualizado');
    setEditingField(null);
    await refresh();
  };

  const openEditField = (field: FormFieldData) => {
    setEditingField(field);
    setNewLabel(field.label);
    setNewType(field.type);
    setNewPlaceholder(field.placeholder ?? '');
    setNewRequired(field.required);
    setNewOptionsRaw(field.options?.map((o) => o.label).join('\n') ?? '');
  };

  const handleDeleteField = async (fieldId: string) => {
    const res = await deleteFormField(fieldId);
    if (!res.success) return toast.error(res.error ?? 'Error');
    toast.success('Campo eliminado');
    await refresh();
  };

  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = form.fields.findIndex((f) => f.id === active.id);
    const newIndex = form.fields.findIndex((f) => f.id === over.id);
    const newFields = arrayMove(form.fields, oldIndex, newIndex);
    setForm((f) => ({ ...f, fields: newFields }));
    await reorderFormFields(form.id, newFields.map((f) => f.id));
  };

  const publicUrl = publicSlug ? `${origin}/f/${publicSlug}` : `${origin}/f/${userId}/${form.slug}`;

  const wpPreview = (() => {
    if (!wpEnabled || !wpNumber || !wpMessage) return null;
    const num = wpNumber.replace(/\D/g, '');
    const msg = form.fields.reduce((acc, f) => acc.replace(new RegExp(`\\{\\{${f.label}\\}\\}`, 'g'), `[${f.label}]`), wpMessage);
    return `https://api.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(msg)}`;
  })();

  return (
    <div className="flex flex-col h-full">

      {/* Header sticky */}
      <div className={`sticky top-0 z-10 mb-2 ${themeClass}`}>
        <div className="flex flex-col overflow-hidden justify-between flex-1 gap-2">

          {/* MetricCards — mejora 3: Activo/WhatsApp muestran Sí/No en vez de 1/0 */}
          <div className="hidden sm:grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <div className="min-w-0">
              <MetricCard label="Campos" value={form.fields.length} icon={<FileText className="h-4 w-4" />} color="#3B82F6" />
            </div>
            <div className="min-w-0">
              <MetricCard label="Registros" value={form._count?.submissions ?? 0} icon={<ClipboardList className="h-4 w-4" />} color="#8B5CF6" />
            </div>
            <div className="min-w-0">
              <MetricCard
                label="Estado"
                value={form.isActive ? 'Sí' : 'No'}
                helper={form.isActive ? 'Activo' : 'Inactivo'}
                icon={form.isActive ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                color={form.isActive ? '#22C55E' : '#6B7280'}
              />
            </div>
            <div className="min-w-0">
              <MetricCard
                label="WhatsApp"
                value={wpEnabled ? 'Sí' : 'No'}
                helper={wpEnabled ? 'Habilitado' : 'Deshabilitado'}
                icon={wpEnabled ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                color={wpEnabled ? '#25D366' : '#6B7280'}
              />
            </div>
          </div>

          {/* Toolbar — mejora 1: toggle Activo/Inactivo directo */}
          <ModuleToolbar className="shrink-0">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href="/mis-formularios">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  Volver
                </Link>
              </Button>
              <p className="text-sm font-semibold truncate min-w-0">{form.title}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {/* Toggle activo */}
              <div className="flex items-center gap-2">
                <Switch
                  id="toolbar-active"
                  checked={form.isActive}
                  onCheckedChange={handleToggleActive}
                  disabled={savingActive}
                />
                <Label htmlFor="toolbar-active" className="text-xs text-muted-foreground cursor-pointer select-none">
                  {form.isActive ? 'Activo' : 'Inactivo'}
                </Label>
              </div>
              <div className="h-4 w-px bg-border" />
              <Button asChild variant="outline" size="sm">
                <Link href={`/mis-formularios/${form.id}/registros`}>
                  <ClipboardList className="w-3.5 h-3.5 mr-1.5" />Registros
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings className="w-3.5 h-3.5 mr-1.5" />Configuración
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Ver
                </a>
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { resetFieldForm(); setAddFieldOpen(true); }}>
                + Campo
              </Button>
            </div>
          </ModuleToolbar>

        </div>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 flex flex-col gap-3">

          {/* Lista de campos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Campos del formulario</CardTitle>
              <Badge variant="secondary">{form.fields.length} campos</Badge>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {form.fields.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 gap-3 text-center">
                  <div className="p-3 rounded-full bg-muted">
                    <FileText className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Sin campos</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Agrega campos para construir tu formulario.</p>
                  </div>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setAddFieldOpen(true)}>
                    + Agregar primer campo
                  </Button>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={form.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2">
                      {form.fields.map((field, index) => (
                        <SortableFieldRow
                          key={field.id}
                          field={field}
                          index={index}
                          onEdit={() => openEditField(field)}
                          onDelete={() => handleDeleteField(field.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </CardContent>
          </Card>

          {/* Sección WhatsApp */}
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-green-500" />
                Redirección a WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="wp-enabled" className="text-sm">Habilitar redirección automática después del envío</Label>
                <Switch id="wp-enabled" checked={wpEnabled} onCheckedChange={setWpEnabled} />
              </div>

              {wpEnabled && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium">Número de WhatsApp (con código de país)</Label>
                    <Input value={wpNumber} onChange={(e) => setWpNumber(e.target.value)} placeholder="ej. 573001234567" />
                    <p className="text-xs text-muted-foreground">Ejemplo: 573001234567</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium">Plantilla del mensaje</Label>
                    <Textarea value={wpMessage} onChange={(e) => setWpMessage(e.target.value)} placeholder="Hola, acabo de llenar el formulario..." rows={3} />
                    {form.fields.length > 0 && (
                      <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/40 border border-border">
                        <p className="text-xs text-muted-foreground font-medium">Variables disponibles:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {form.fields.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setWpMessage((prev) => prev + `{{${f.label}}}`)}
                              className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 rounded px-2 py-0.5 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors font-mono"
                            >
                              {`{{${f.label}}}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {wpPreview && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Vista previa del enlace:</p>
                      <p className="text-xs text-amber-600 dark:text-amber-500 break-all font-mono">{wpPreview}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <Button size="sm" variant="ghost" onClick={() => { setWpEnabled(form.whatsappEnabled); setWpNumber(form.whatsappNumber ?? ''); setWpMessage(form.whatsappMessage ?? ''); }}>
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={handleSaveWhatsapp} disabled={savingWp}>
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      {savingWp ? 'Guardando...' : 'Guardar WhatsApp'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Sección URL Pública */}
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-500" />
                URL personalizada
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center rounded-md border border-input bg-background overflow-hidden">
                  <span className="px-3 py-2 text-sm text-muted-foreground bg-muted border-r border-input select-none shrink-0">/f/</span>
                  <input
                    className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent outline-none"
                    placeholder="nombre-formulario"
                    value={publicSlugInput}
                    onChange={(e) => setPublicSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  />
                </div>
                <Button size="sm" onClick={handleSavePublicSlug} disabled={slugSaving || !publicSlugInput.trim()}>
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  {slugSaving ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
              {publicSlug && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2">
                  <p className="text-xs text-blue-700 dark:text-blue-400 font-mono flex-1 break-all">{origin}/f/{publicSlug}</p>
                  <a
                    href={`/f/${publicSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-blue-600 hover:text-blue-800 dark:text-blue-400"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Solo letras minúsculas, números y guiones. Ej: <span className="font-mono">mi-formulario</span></p>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Dialog: Configuración — mejora 4: h-[585px] estándar */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="flex h-[585px] flex-col sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Configuración del formulario</DialogTitle>
          </DialogHeader>
          <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto py-2 pr-1">
            <div className="flex flex-col gap-1.5">
              <Label>Título</Label>
              <Input value={titleInput} onChange={(e) => setTitleInput(e.target.value.toUpperCase())} className="uppercase" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Slug (URL)</Label>
              <Input value={slugInput} onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="font-mono text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Descripción</Label>
              <Textarea value={descInput} onChange={(e) => setDescInput(e.target.value)} rows={2} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Google Sheets URL</Label>
              <Input value={sheetsInput} onChange={(e) => setSheetsInput(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
              <p className="text-xs text-muted-foreground">Los registros se sincronizarán automáticamente.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveSettings} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Agregar / Editar campo — mejora 4: h-[585px] estándar */}
      <Dialog open={addFieldOpen || !!editingField} onOpenChange={(o) => { if (!o) { setAddFieldOpen(false); setEditingField(null); } }}>
        <DialogContent className="flex max-h-[585px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[500px]">
          <DialogHeader className="flex flex-row items-center justify-between border-b bg-muted/30 px-5 py-4 space-y-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <DialogTitle className="text-base">{editingField ? 'Editar campo' : 'Nuevo campo'}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            <FieldForm
              label={newLabel} setLabel={setNewLabel}
              type={newType} setType={setNewType}
              placeholder={newPlaceholder} setPlaceholder={setNewPlaceholder}
              required={newRequired} setRequired={setNewRequired}
              optionsRaw={newOptionsRaw} setOptionsRaw={setNewOptionsRaw}
            />
          </div>
          <DialogFooter className="flex-row items-center justify-between border-t bg-muted/20 px-5 py-3">
            <Button variant="ghost" onClick={() => { setAddFieldOpen(false); setEditingField(null); }}>Cancelar</Button>
            <Button onClick={editingField ? handleUpdateField : handleAddField} disabled={savingField}>
              {savingField ? 'Guardando...' : editingField ? 'Actualizar' : 'Agregar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableFieldRow({
  field, index, onEdit, onDelete,
}: {
  field: FormFieldData;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors ${isDragging ? 'opacity-50 shadow-lg z-50' : ''}`}
    >
      <div className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0" {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{field.label}</span>
          {field.required && <Badge variant="destructive" className="text-xs py-0 h-4">Requerido</Badge>}
          <Badge variant="outline" className="text-xs py-0 h-4 text-muted-foreground">{FIELD_TYPE_LABELS[field.type]}</Badge>
        </div>
        {field.options && field.options.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Opciones: {field.options.map((o) => o.label).join(', ')}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function FieldForm({
  label, setLabel, type, setType, placeholder, setPlaceholder,
  required, setRequired, optionsRaw, setOptionsRaw,
}: {
  label: string; setLabel: (v: string) => void;
  type: FormFieldType; setType: (v: FormFieldType) => void;
  placeholder: string; setPlaceholder: (v: string) => void;
  required: boolean; setRequired: (v: boolean) => void;
  optionsRaw: string; setOptionsRaw: (v: string) => void;
}) {
  const showPlaceholder = !['checkbox', 'file', 'date', 'time', 'multiselect', 'radio'].includes(type);
  const showOptions = TYPES_WITH_OPTIONS.includes(type);

  function handleTypeChange(v: FormFieldType) {
    setType(v);
    const isDefaultPlaceholder = Object.values(DEFAULT_PLACEHOLDERS).includes(placeholder);
    if (!placeholder || isDefaultPlaceholder) {
      setPlaceholder(DEFAULT_PLACEHOLDERS[v] ?? '');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label className="font-semibold text-foreground">Pregunta</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ej. ¿Cuál es tu nombre?" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="font-semibold text-foreground">Tipo de campo</Label>
          <Select value={type} onValueChange={(v) => handleTypeChange(v as FormFieldType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(FIELD_TYPE_LABELS) as [FormFieldType, string][]).map(([val, lbl]) => (
                <SelectItem key={val} value={val}>{lbl}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col justify-end items-end gap-1.5">
          <Label className="font-semibold text-foreground">Obligatorio</Label>
          <div className="flex items-center gap-2 h-10">
            <span className="text-sm text-muted-foreground">{required ? 'Sí, es obligatorio' : 'Opcional'}</span>
            <Switch id="field-required" checked={required} onCheckedChange={setRequired} />
          </div>
        </div>
      </div>

      {showPlaceholder && (
        <div className="flex flex-col gap-1.5">
          <Label className="font-semibold text-foreground">Placeholder</Label>
          <Input value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} placeholder="Texto de ayuda dentro del campo..." />
        </div>
      )}
      {showOptions && (
        <div className="flex flex-col gap-1.5">
          <Label className="font-semibold text-foreground">Opciones <span className="font-normal text-muted-foreground">(una por línea)</span></Label>
          <Textarea value={optionsRaw} onChange={(e) => setOptionsRaw(e.target.value)} placeholder={'Opción 1\nOpción 2\nOpción 3'} rows={4} />
        </div>
      )}
    </div>
  );
}
