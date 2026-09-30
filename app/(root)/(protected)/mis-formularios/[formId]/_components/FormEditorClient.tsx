'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft, Trash2, Save, ExternalLink,
  Settings, Pencil, GripVertical, FileText, MessageCircle,
  ClipboardList, Link2, Check,
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
import { useRouter } from 'next/navigation';
import { ModuleToolbar } from '@/components/shared/ModuleToolbar';
import { themeClass } from '@/types/generic';
import {
  updateForm, addFormField, updateFormField, deleteFormField, reorderFormFields,
  getFormById, updateFormPublicSlug, type FormData, type FormFieldData, type FormFieldOption, type FormFieldType,
} from '@/actions/forms-actions';
import { BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { AccionesMasivas } from '@/components/shared/AccionesMasivas';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  NOMBRE_DEL_TIPO, TIPOS_CON_OPCIONES, TIPOS_DE_CAMPO, comoSeEscribeElSlug,
  elEnlaceDeWhatsapp, elEnlaceDelFormulario, laVariable,
} from '@/lib/formularios';
import { AyudaDeLaHoja } from '../../_components/AyudaDeLaHoja';

// Los tipos y sus nombres viven en `lib/formularios.ts`: la guía los compara
// con los que ofrece este desplegable.
const TYPES_WITH_OPTIONS: ReadonlyArray<FormFieldType> = TIPOS_CON_OPCIONES;

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
  /** Con qué correo escribe la plataforma en Google Sheets: hay que compartirle la hoja. */
  correoDeLaHoja: string | null;
}

export function FormEditorClient({ form: initialForm, correoDeLaHoja }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(initialForm);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<FormFieldData | null>(null);
  const [fieldToDelete, setFieldToDelete] = useState<FormFieldData | null>(null);
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
    if (wpEnabled && !wpNumber.replace(/\D/g, '')) return toast.error('Escribe el número de WhatsApp al que se redirige');
    if (wpEnabled && !wpMessage.trim()) return toast.error('Escribe la plantilla del mensaje');
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
    if (!newLabel.trim()) return toast.error('Escribe la pregunta');
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

  // Borrar un campo pide confirmación, como borrar el formulario o un
  // registro: se iba al primer clic, y con él la columna de sus respuestas en
  // los registros que ya había.
  const handleDeleteField = async () => {
    if (!fieldToDelete) return;
    const res = await deleteFormField(fieldToDelete.id);
    setFieldToDelete(null);
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
    const before = form.fields;
    const newFields = arrayMove(form.fields, oldIndex, newIndex);
    setForm((f) => ({ ...f, fields: newFields }));
    const res = await reorderFormFields(form.id, newFields.map((f) => f.id));
    if (!res.success) {
      // Si el servidor dice que no, el orden vuelve a como estaba: una lista
      // que se queda movida sin estar guardada vuelve sola al recargar.
      setForm((f) => ({ ...f, fields: before }));
      toast.error(res.error ?? 'No se pudo guardar el orden');
    }
  };

  // El enlace de la cuenta DUEÑA del formulario, no el de quien mira.
  const publicUrl = `${origin}${elEnlaceDelFormulario({ ...form, publicSlug })}`;

  // La vista previa sustituye cada `{{Pregunta}}` por `[Pregunta]` con la
  // MISMA función que usa el formulario público: una pregunta con «?» o «(»
  // rompía la expresión regular de antes y la variable no se sustituía.
  const wpPreview = wpEnabled ? elEnlaceDeWhatsapp(wpNumber, wpMessage, form.fields) : null;

  // Lo de WhatsApp se guarda con su botón, y el botón sale en cuanto hay algo
  // que guardar —apagarlo también—. Antes solo salía con la redirección
  // encendida, así que apagarla no se podía guardar y volvía sola al recargar.
  const wpCambiado =
    wpEnabled !== form.whatsappEnabled ||
    wpNumber.trim() !== (form.whatsappNumber ?? '') ||
    wpMessage.trim() !== (form.whatsappMessage ?? '');

  return (
    <div className="flex flex-col h-full">

      {/* Header sticky */}
      <div className={`sticky top-0 z-10 mb-2 ${themeClass}`}>
        <div className="flex flex-col overflow-hidden justify-between flex-1 gap-2">

          {/* Toolbar — mejora 1: toggle Activo/Inactivo directo */}
          <ModuleToolbar
            className="shrink-0"
            right={<BotonDeCrear onClick={() => { resetFieldForm(); setAddFieldOpen(true); }}>Nuevo</BotonDeCrear>}
            acciones={
              /* Los tres enlaces sueltos se comían la barra y ninguno crea
                 nada: van dentro del `⋯`, que es donde vive lo que no se usa
                 a diario. */
              <AccionesMasivas
                seleccionados={[]}
                queSon="campos"
                extras={[
                  // Las dos cifras que iban como pastillas no filtraban nada (la
                  // regla de la barra dice que entonces se borran): los campos ya
                  // los cuenta su tarjeta, y los registros van aquí, en el mando
                  // que lleva a ellos.
                  { clave: 'registros', etiqueta: `Ver registros (${form._count?.submissions ?? 0})`, icono: <ClipboardList className="h-4 w-4" />, sinSeleccion: true, onSelect: () => router.push(`/mis-formularios/${form.id}/registros`) },
                  { clave: 'ajustes', etiqueta: 'Configuración', icono: <Settings className="h-4 w-4" />, sinSeleccion: true, onSelect: () => setSettingsOpen(true) },
                  { clave: 'ver', etiqueta: 'Ver formulario', icono: <ExternalLink className="h-4 w-4" />, sinSeleccion: true, onSelect: () => window.open(publicUrl, '_blank', 'noopener,noreferrer') },
                ]}
              />
            }
          >
            <div className="flex min-w-0 shrink-0 items-center gap-3">
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href="/mis-formularios">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  Volver
                </Link>
              </Button>
              <p className="text-sm font-semibold truncate min-w-0">{form.title}</p>
            </div>
            {/* El interruptor de activo es un mando de la pantalla: se queda a
                la izquierda. A la derecha solo lo que crea o actúa. */}
            <div className="flex shrink-0 items-center gap-2">
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
          </ModuleToolbar>

        </div>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 flex flex-col gap-3">

          {/* Lista de campos */}
          <Card data-campos-del-formulario>
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
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { resetFieldForm(); setAddFieldOpen(true); }}>
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
                          onDelete={() => setFieldToDelete(field)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </CardContent>
          </Card>

          {/* Sección WhatsApp */}
          <Card data-seccion-whatsapp>
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
                              onClick={() => setWpMessage((prev) => prev + laVariable(f.label))}
                              className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 rounded px-2 py-0.5 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors font-mono"
                            >
                              {laVariable(f.label)}
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
                </>
              )}

              {(wpEnabled || wpCambiado) && (
                <div className="flex items-center justify-between">
                  <Button size="sm" variant="ghost" disabled={!wpCambiado} onClick={() => { setWpEnabled(form.whatsappEnabled); setWpNumber(form.whatsappNumber ?? ''); setWpMessage(form.whatsappMessage ?? ''); }}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSaveWhatsapp} disabled={savingWp || !wpCambiado}>
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    {savingWp ? 'Guardando...' : wpCambiado ? 'Guardar WhatsApp' : 'Guardado'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sección URL Pública */}
          <Card data-seccion-url>
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
                    onChange={(e) => setPublicSlugInput(comoSeEscribeElSlug(e.target.value))}
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
                    title="Abrir el formulario"
                    aria-label="Abrir el formulario"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Un nombre corto para el enlace. Las tildes se quitan y los espacios pasan a guiones. Ej: <span className="font-mono">mi-formulario</span></p>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Dialog: Configuración. Mide lo que su contenido, como «Nuevo
          formulario», que tiene los mismos cuatro campos: con un alto fijo de
          585 px salía con media ventana en blanco. */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Configuración del formulario</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Título</Label>
              <Input value={titleInput} onChange={(e) => setTitleInput(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Slug (URL)</Label>
              <Input value={slugInput} onChange={(e) => setSlugInput(comoSeEscribeElSlug(e.target.value))} className="font-mono text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Descripción</Label>
              <Textarea value={descInput} onChange={(e) => setDescInput(e.target.value)} rows={2} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Google Sheets URL</Label>
              <Input value={sheetsInput} onChange={(e) => setSheetsInput(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
              <AyudaDeLaHoja correo={correoDeLaHoja} />
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
        <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[500px]">
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

      {/* Alert: eliminar un campo */}
      <AlertDialog open={!!fieldToDelete} onOpenChange={(o) => !o && setFieldToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el campo «{fieldToDelete?.label}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de salir en el formulario. Las respuestas que ya llegaron se conservan en los registros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteField} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      data-campo={index + 1}
      className={`flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors ${isDragging ? 'opacity-50 shadow-lg z-50' : ''}`}
    >
      <div className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0" title="Arrastra para ordenar" {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{field.label}</span>
          {field.required && <Badge variant="destructive" className="text-xs py-0 h-4">Requerido</Badge>}
          <Badge variant="outline" className="text-xs py-0 h-4 text-muted-foreground">{NOMBRE_DEL_TIPO[field.type] ?? field.type}</Badge>
        </div>
        {field.options && field.options.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Opciones: {field.options.map((o) => o.label).join(', ')}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Editar campo" aria-label="Editar campo">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} title="Eliminar campo" aria-label="Eliminar campo">
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
              {TIPOS_DE_CAMPO.map(({ tipo, nombre }) => (
                <SelectItem key={tipo} value={tipo}>{nombre}</SelectItem>
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
          <Label className="font-semibold text-foreground">Texto de ayuda</Label>
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
