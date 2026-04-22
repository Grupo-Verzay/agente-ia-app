'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Bot, Check, Edit2, Info, Loader2, Lock,
  Plus, RefreshCw, RotateCcw, Search, Sparkles, Trash2, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { BUILTIN_TOOL_CATALOG } from '@/lib/external-data-tool-catalog';
import {
  listToolConfigs, addBuiltinTool, updateBuiltinTool,
  upsertDataQueryTool, deleteToolConfig, toggleToolConfig,
  applyDefaultToolConfigs, restoreToolConfigDefault,
} from '@/actions/external-data-tool-config-actions';
import type {
  ExternalDataBuiltinToolType, ExternalDataQueryToolType,
  ExternalDataToolConfig, ExternalDataToolConfigInput,
} from '@/types/external-client-data';
import { CRITICAL_TOOL_TYPES } from '@/types/external-client-data';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_AUTO_INJECT_TEMPLATE = `## PERFIL DEL CLIENTE (datos registrados en el sistema)
{data}
Usa estos datos para personalizar tus respuestas. No los repitas todos de golpe; solo menciona los relevantes según el contexto. No inventes ni modifiques ninguno de estos valores.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateDisplayName(name: string): string | null {
  if (!name.trim()) return 'El nombre visible es requerido';
  if (name.trim().length > 80) return 'Máximo 80 caracteres';
  return null;
}
function validateDescription(desc: string): string | null {
  if (!desc.trim()) return 'La descripción es requerida';
  if (desc.trim().length < 20) return 'La descripción debe ser más detallada (mín. 20 caracteres)';
  if (desc.trim().length > 500) return 'Máximo 500 caracteres';
  return null;
}
function validateSearchField(field: string): string | null {
  if (!field.trim()) return 'El campo de búsqueda es requerido';
  return null;
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1">{message}</p>;
}
function FieldHint({ message }: { message: string }) {
  return (
    <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1.5">
      <Info className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
      {message}
    </p>
  );
}

// ─── Tool card ────────────────────────────────────────────────────────────────

const BUILTIN_TYPE_LABELS: Record<ExternalDataBuiltinToolType, string> = {
  notificacion_asesor: 'Notificación asesor',
  ejecutar_flujos: 'Ejecutar flujos',
  listar_workflows: 'Listar flujos',
  consultar_datos_cliente: 'Consulta cliente',
  buscar_cliente_por_dato: 'Buscar por dato',
  buscar_producto: 'Buscar producto',
  listar_productos: 'Listar productos',
};

function ToolCard({
  cfg, onToggle, onEdit, onDelete,
}: {
  cfg: ExternalDataToolConfig;
  onToggle: (cfg: ExternalDataToolConfig, v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isBuiltin = cfg.toolCategory === 'builtin';
  const isCritical = CRITICAL_TOOL_TYPES.includes(cfg.toolType as ExternalDataBuiltinToolType);

  return (
    <Card className={cn('transition-opacity', !cfg.isEnabled && 'opacity-55')}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex-shrink-0 rounded-md bg-primary/10 p-2">
            {isBuiltin ? <Sparkles className="h-4 w-4 text-primary" />
              : cfg.toolType === 'auto_inject' ? <Zap className="h-4 w-4 text-amber-500" />
              : <Search className="h-4 w-4 text-primary" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{cfg.displayName}</span>
              <Badge variant="outline" className="text-[10px] font-mono">{cfg.toolKey}</Badge>
              {isBuiltin && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Lock className="h-2.5 w-2.5" />
                  {BUILTIN_TYPE_LABELS[cfg.toolType as ExternalDataBuiltinToolType] ?? cfg.toolType}
                </Badge>
              )}
              {!isBuiltin && cfg.toolType === 'auto_inject' && (
                <Badge className="text-[10px] bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400">
                  system prompt
                </Badge>
              )}
              {!isBuiltin && cfg.toolType === 'search_by_field' && (
                <Badge variant="outline" className="text-[10px]">búsqueda por campo</Badge>
              )}
              {isCritical && (
                <Badge variant="destructive" className="text-[10px] opacity-70">crítica</Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{cfg.toolDescription}</p>

            {!isBuiltin && cfg.toolType === 'search_by_field' && cfg.searchField && (
              <p className="text-xs mt-1">
                <span className="text-muted-foreground">Campo: </span>
                <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{cfg.searchField}</code>
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isCritical && !cfg.isEnabled && (
              <span title="Herramienta crítica desactivada">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              </span>
            )}
            <Switch
              checked={cfg.isEnabled}
              onCheckedChange={(v) => onToggle(cfg, v)}
              title={cfg.isEnabled ? 'Deshabilitar' : 'Habilitar'}
            />
            <Button variant="ghost" size="icon" onClick={onEdit} title="Editar">
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon" onClick={onDelete} title="Eliminar"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Dialog: Add builtin ──────────────────────────────────────────────────────

function AddBuiltinDialog({
  open, onClose, existingToolTypes, onAdd,
}: {
  open: boolean;
  onClose: () => void;
  existingToolTypes: Set<string>;
  onAdd: (toolType: ExternalDataBuiltinToolType, overrides: { displayName: string; toolDescription: string }) => Promise<void>;
}) {
  const [step, setStep] = useState<'catalog' | 'configure'>('catalog');
  const [selected, setSelected] = useState<(typeof BUILTIN_TOOL_CATALOG)[number] | null>(null);
  const [form, setForm] = useState({ displayName: '', toolDescription: '' });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [isSaving, setIsSaving] = useState(false);

  const resetAndClose = () => {
    setStep('catalog'); setSelected(null);
    setForm({ displayName: '', toolDescription: '' }); setErrors({});
    onClose();
  };

  const handleSelect = (entry: (typeof BUILTIN_TOOL_CATALOG)[number]) => {
    setSelected(entry);
    setForm({ displayName: entry.defaultDisplayName, toolDescription: entry.defaultDescription });
    setErrors({}); setStep('configure');
  };

  const validate = () => {
    const e = {
      displayName: validateDisplayName(form.displayName),
      toolDescription: validateDescription(form.toolDescription),
    };
    setErrors(e);
    return Object.values(e).every((v) => v === null);
  };

  const handleSave = async () => {
    if (!selected || !validate()) return;
    setIsSaving(true);
    try { await onAdd(selected.toolType, form); resetAndClose(); }
    finally { setIsSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isSaving) resetAndClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {step === 'catalog' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Catálogo de herramientas del sistema
              </DialogTitle>
              <DialogDescription>
                Selecciona una herramienta para agregarla a tu agente IA.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              {BUILTIN_TOOL_CATALOG.map((entry) => {
                const alreadyAdded = existingToolTypes.has(entry.toolType);
                return (
                  <button key={entry.toolType} onClick={() => !alreadyAdded && handleSelect(entry)}
                    disabled={alreadyAdded}
                    className={cn('w-full text-left rounded-lg border p-4 transition-colors',
                      alreadyAdded ? 'opacity-50 cursor-not-allowed bg-muted/30'
                        : 'hover:border-primary/50 hover:bg-primary/5 cursor-pointer')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-md bg-primary/10 p-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{entry.defaultDisplayName}</span>
                            {entry.isCritical && (
                              <Badge variant="destructive" className="text-[10px] opacity-70">crítica</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{entry.helpText}</p>
                        </div>
                      </div>
                      {alreadyAdded
                        ? <Badge variant="secondary" className="text-[10px] shrink-0"><Check className="h-2.5 w-2.5 mr-1" />Agregada</Badge>
                        : <Plus className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose}>Cancelar</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <button onClick={() => setStep('catalog')}
                  className="text-muted-foreground hover:text-foreground transition-colors text-sm font-normal underline-offset-2 hover:underline">
                  ← Catálogo
                </button>
                <span className="text-muted-foreground">/</span>
                {selected?.defaultDisplayName}
              </DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-4 py-2">
                <Alert className="bg-primary/5 border-primary/20">
                  <Info className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-xs">
                    {selected.helpText}
                    {selected.isCritical && (
                      <span className="block mt-1 text-amber-600 dark:text-amber-400 font-medium">
                        ⚠ Esta herramienta es crítica para el funcionamiento del agente.
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
                <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs flex items-center gap-2 text-muted-foreground">
                  <Lock className="h-3 w-3 shrink-0" />
                  Identificador técnico:{' '}
                  <code className="font-mono bg-background border px-1.5 rounded">{selected.defaultKey}</code>
                </div>
                <div className="space-y-1.5">
                  <Label>Nombre visible en el panel</Label>
                  <Input value={form.displayName}
                    onChange={(e) => { setForm((f) => ({ ...f, displayName: e.target.value })); setErrors((e2) => ({ ...e2, displayName: null })); }}
                    placeholder={selected.defaultDisplayName} />
                  <FieldError message={errors.displayName ?? null} />
                </div>
                <div className="space-y-1.5">
                  <Label>Descripción para el agente IA</Label>
                  <Textarea rows={4} value={form.toolDescription}
                    onChange={(e) => { setForm((f) => ({ ...f, toolDescription: e.target.value })); setErrors((e2) => ({ ...e2, toolDescription: null })); }}
                    placeholder={selected.defaultDescription} />
                  <FieldError message={errors.toolDescription ?? null} />
                  <FieldHint message="El agente decide cuándo invocar esta herramienta basándose en esta descripción." />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('catalog')} disabled={isSaving}>Volver</Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Agregar herramienta
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog: Edit builtin ─────────────────────────────────────────────────────

function EditBuiltinDialog({ open, cfg, onClose, onSave, onRestore }: {
  open: boolean; cfg: ExternalDataToolConfig | null; onClose: () => void;
  onSave: (key: string, updates: { displayName: string; toolDescription: string }) => Promise<void>;
  onRestore: (toolKey: string) => Promise<void>;
}) {
  const [form, setForm] = useState({ displayName: '', toolDescription: '' });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (cfg) { setForm({ displayName: cfg.displayName, toolDescription: cfg.toolDescription }); setErrors({}); }
  }, [cfg]);

  const validate = () => {
    const e = { displayName: validateDisplayName(form.displayName), toolDescription: validateDescription(form.toolDescription) };
    setErrors(e);
    return Object.values(e).every((v) => v === null);
  };

  const catalogEntry = cfg ? BUILTIN_TOOL_CATALOG.find((c) => c.toolType === cfg.toolType) : null;
  const isBusy = isSaving || isRestoring;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isBusy) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Editar herramienta del sistema
          </DialogTitle>
          <DialogDescription>
            Solo puedes personalizar el nombre y la descripción que el agente usa para decidir cuándo invocarla.
          </DialogDescription>
        </DialogHeader>
        {cfg && catalogEntry && (
          <div className="space-y-4 py-2">
            {catalogEntry.isCritical && (
              <Alert className="border-amber-500/40 bg-amber-500/5">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                  Esta es una herramienta crítica. Cambiar su descripción puede afectar cuándo el agente decide invocarla.
                </AlertDescription>
              </Alert>
            )}
            <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs flex items-center gap-2 text-muted-foreground">
              <Lock className="h-3 w-3 shrink-0" />
              Identificador técnico:{' '}
              <code className="font-mono bg-background border px-1.5 rounded">{cfg.toolKey}</code>
            </div>
            <div className="space-y-1.5">
              <Label>Nombre visible en el panel</Label>
              <Input value={form.displayName}
                onChange={(e) => { setForm((f) => ({ ...f, displayName: e.target.value })); setErrors((e2) => ({ ...e2, displayName: null })); }} />
              <FieldError message={errors.displayName ?? null} />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción para el agente IA</Label>
              <Textarea rows={4} value={form.toolDescription}
                onChange={(e) => { setForm((f) => ({ ...f, toolDescription: e.target.value })); setErrors((e2) => ({ ...e2, toolDescription: null })); }} />
              <FieldError message={errors.toolDescription ?? null} />
              <FieldHint message="El agente decide cuándo usar esta herramienta basándose en esta descripción. Usa lenguaje claro y específico." />
            </div>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground h-8"
              onClick={async () => { setIsRestoring(true); try { await onRestore(cfg.toolKey); onClose(); } finally { setIsRestoring(false); } }}
              disabled={isBusy}>
              {isRestoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Restaurar descripción al valor por defecto
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isBusy}>Cancelar</Button>
          <Button onClick={async () => { if (!cfg || !validate()) return; setIsSaving(true); try { await onSave(cfg.toolKey, form); onClose(); } finally { setIsSaving(false); } }}
            disabled={isBusy} className="gap-2">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog: Data query tool ──────────────────────────────────────────────────

function DataQueryDialog({ open, editingConfig, onClose, onSave }: {
  open: boolean; editingConfig: ExternalDataToolConfig | null;
  onClose: () => void;
  onSave: (input: ExternalDataToolConfigInput, editingKey?: string) => Promise<void>;
}) {
  const isEditing = !!editingConfig;
  const [form, setForm] = useState<Omit<ExternalDataToolConfigInput, 'toolKey'>>({
    displayName: '', toolDescription: '', toolCategory: 'data_query',
    toolType: 'search_by_field', searchField: '', promptTemplate: DEFAULT_AUTO_INJECT_TEMPLATE, isEnabled: true,
  });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (editingConfig) {
      setForm({
        displayName: editingConfig.displayName, toolDescription: editingConfig.toolDescription,
        toolCategory: 'data_query', toolType: editingConfig.toolType as ExternalDataQueryToolType,
        searchField: editingConfig.searchField ?? '', promptTemplate: editingConfig.promptTemplate ?? DEFAULT_AUTO_INJECT_TEMPLATE,
        isEnabled: editingConfig.isEnabled,
      });
    } else {
      setForm({ displayName: '', toolDescription: '', toolCategory: 'data_query', toolType: 'search_by_field', searchField: '', promptTemplate: DEFAULT_AUTO_INJECT_TEMPLATE, isEnabled: true });
    }
    setErrors({});
  }, [editingConfig, open]);

  function previewToolKey(name: string) {
    return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || '…';
  }

  const validate = () => {
    const e: Record<string, string | null> = {
      displayName: validateDisplayName(form.displayName),
      toolDescription: validateDescription(form.toolDescription),
      searchField: form.toolType === 'search_by_field' ? validateSearchField(form.searchField ?? '') : null,
    };
    setErrors(e);
    return Object.values(e).every((v) => v === null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isSaving) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? <><Edit2 className="h-4 w-4" />Editar herramienta dinámica</>
              : <><Plus className="h-4 w-4" />Nueva herramienta de consulta</>}
          </DialogTitle>
          <DialogDescription>
            Las herramientas dinámicas permiten al agente consultar tus datos externos con comportamiento 100% configurable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label>Tipo de herramienta</Label>
            <Select value={form.toolType as ExternalDataQueryToolType}
              onValueChange={(v) => { setForm((f) => ({ ...f, toolType: v as ExternalDataQueryToolType })); setErrors({}); }}
              disabled={isEditing}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="search_by_field">
                  <div className="flex items-center gap-2"><Search className="h-3.5 w-3.5" />Búsqueda por campo específico</div>
                </SelectItem>
                <SelectItem value="auto_inject">
                  <div className="flex items-center gap-2"><Zap className="h-3.5 w-3.5" />Inyección automática en system prompt</div>
                </SelectItem>
              </SelectContent>
            </Select>
            {!isEditing && form.toolType === 'search_by_field' && (
              <FieldHint message="El agente puede buscar cualquier contacto dado un valor de campo. Útil para consultas por cédula, correo, contrato, etc." />
            )}
            {!isEditing && form.toolType === 'auto_inject' && (
              <FieldHint message="Los datos del contacto que está escribiendo se inyectan automáticamente en el contexto del agente al inicio de cada conversación." />
            )}
          </div>

          {form.toolType === 'search_by_field' && (
            <div className="space-y-1.5">
              <Label>Campo de búsqueda <span className="text-destructive">*</span></Label>
              <Input value={form.searchField ?? ''}
                onChange={(e) => { setForm((f) => ({ ...f, searchField: e.target.value })); setErrors((err) => ({ ...err, searchField: null })); }}
                placeholder="ej: CEDULA-RIF" />
              <FieldError message={errors.searchField ?? null} />
              <FieldHint message="Debe coincidir exactamente con el nombre de la columna en tus datos (sensible a mayúsculas). Ej: si importaste 'CEDULA', escribe exactamente eso." />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Nombre visible <span className="text-destructive">*</span></Label>
            <Input value={form.displayName}
              onChange={(e) => { setForm((f) => ({ ...f, displayName: e.target.value })); setErrors((e2) => ({ ...e2, displayName: null })); }}
              placeholder="ej: Buscar por cédula" />
            <FieldError message={errors.displayName ?? null} />
          </div>

          <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs flex items-center gap-2 text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" />
            {isEditing
              ? <>Identificador técnico: <code className="font-mono bg-background border px-1.5 rounded">{editingConfig?.toolKey}</code></>
              : <>Se generará como: <code className="font-mono bg-background border px-1.5 rounded">{previewToolKey(form.displayName)}</code></>}
          </div>

          <div className="space-y-1.5">
            <Label>Descripción para el agente IA <span className="text-destructive">*</span></Label>
            <Textarea rows={4} value={form.toolDescription}
              onChange={(e) => { setForm((f) => ({ ...f, toolDescription: e.target.value })); setErrors((e2) => ({ ...e2, toolDescription: null })); }}
              placeholder={form.toolType === 'search_by_field'
                ? 'ej: Busca información de un cliente a partir de su cédula. Úsala cuando el usuario proporcione una cédula para consultar sus datos.'
                : 'ej: Inyecta automáticamente los datos del cliente en cada conversación para personalizar las respuestas.'} />
            <FieldError message={errors.toolDescription ?? null} />
            <FieldHint message="Cuanto más precisa sea la descripción, mejor decidirá el agente cuándo invocar esta herramienta. Incluye ejemplos de cuándo usarla." />
          </div>

          {form.toolType === 'auto_inject' && (
            <div className="space-y-1.5">
              <Label>Plantilla de prompt <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
              <Textarea rows={6} value={form.promptTemplate ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, promptTemplate: e.target.value }))}
                className="font-mono text-xs" />
              <FieldHint message="Usa {data} donde quieras insertar los datos. Si se deja vacío, se usa la plantilla del sistema." />
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <Switch checked={form.isEnabled} onCheckedChange={(v) => setForm((f) => ({ ...f, isEnabled: v }))} id="dq-enabled" />
            <Label htmlFor="dq-enabled" className="cursor-pointer">Herramienta habilitada al crear</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button onClick={async () => {
            if (!validate()) return;
            setIsSaving(true);
            try { await onSave({ ...form, toolKey: '' }, editingConfig?.toolKey); onClose(); }
            finally { setIsSaving(false); }
          }} disabled={isSaving} className="gap-2">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? 'Guardar cambios' : 'Crear herramienta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete dialog ────────────────────────────────────────────────────────────

function DeleteDialog({ cfg, onClose, onConfirm }: {
  cfg: ExternalDataToolConfig | null; onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const isCritical = cfg ? CRITICAL_TOOL_TYPES.includes(cfg.toolType as ExternalDataBuiltinToolType) : false;

  return (
    <Dialog open={!!cfg} onOpenChange={(v) => { if (!v && !isDeleting) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar herramienta</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de eliminar <strong>&ldquo;{cfg?.displayName}&rdquo;</strong>?
            El agente IA dejará de tenerla disponible de inmediato. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        {isCritical && (
          <Alert className="border-destructive/40 bg-destructive/5">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-xs text-destructive">
              Esta es una herramienta crítica del sistema. Puedes deshabilitarla en vez de eliminarla.
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>Cancelar</Button>
          <Button variant="destructive" disabled={isDeleting} className="gap-2"
            onClick={async () => { setIsDeleting(true); try { await onConfirm(); } finally { setIsDeleting(false); } }}>
            {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { userId: string }

export function MyToolsManagement({ userId }: Props) {
  const [configs, setConfigs] = useState<ExternalDataToolConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplyingDefaults, setIsApplyingDefaults] = useState(false);

  const [addBuiltinOpen, setAddBuiltinOpen] = useState(false);
  const [editBuiltinCfg, setEditBuiltinCfg] = useState<ExternalDataToolConfig | null>(null);
  const [dataQueryOpen, setDataQueryOpen] = useState(false);
  const [editDataQueryCfg, setEditDataQueryCfg] = useState<ExternalDataToolConfig | null>(null);
  const [deleteCfg, setDeleteCfg] = useState<ExternalDataToolConfig | null>(null);

  const loadConfigs = useCallback(async () => {
    setIsLoading(true);
    try { setConfigs(await listToolConfigs(userId)); }
    catch { setConfigs([]); }
    finally { setIsLoading(false); }
  }, [userId]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const handleApplyDefaults = async () => {
    setIsApplyingDefaults(true);
    try {
      const result = await applyDefaultToolConfigs(userId);
      if (result.success) {
        result.created === 0
          ? toast.info('Todas las herramientas del sistema ya estaban configuradas')
          : toast.success(`${result.created} herramienta${result.created !== 1 ? 's' : ''} agregada${result.created !== 1 ? 's' : ''}`);
        loadConfigs();
      } else { toast.error(result.error ?? 'Error al aplicar configuración'); }
    } finally { setIsApplyingDefaults(false); }
  };

  const handleAddBuiltin = async (toolType: ExternalDataBuiltinToolType, overrides: { displayName: string; toolDescription: string }) => {
    const result = await addBuiltinTool(userId, toolType, overrides);
    if (result.success) { toast.success('Herramienta del sistema agregada'); loadConfigs(); }
    else { toast.error(result.error ?? 'Error al agregar herramienta'); throw new Error(result.error); }
  };

  const handleEditBuiltin = async (currentKey: string, updates: { displayName: string; toolDescription: string }) => {
    const result = await updateBuiltinTool(userId, currentKey, updates);
    if (result.success) { toast.success('Herramienta actualizada'); loadConfigs(); }
    else { toast.error(result.error ?? 'Error al actualizar'); throw new Error(result.error); }
  };

  const handleRestoreBuiltin = async (toolKey: string) => {
    const result = await restoreToolConfigDefault(userId, toolKey);
    if (result.success) { toast.success('Descripción restaurada'); loadConfigs(); }
    else { toast.error(result.error ?? 'Error al restaurar'); throw new Error(result.error); }
  };

  const handleSaveDataQuery = async (input: ExternalDataToolConfigInput, editingKey?: string) => {
    const result = await upsertDataQueryTool(userId, input, editingKey);
    if (result.success) {
      if (result.warning) toast.warning(result.warning);
      toast.success(editingKey ? 'Herramienta actualizada' : 'Herramienta creada');
      loadConfigs();
    } else { toast.error(result.error ?? 'Error al guardar'); throw new Error(result.error); }
  };

  const handleToggle = async (cfg: ExternalDataToolConfig, isEnabled: boolean) => {
    setConfigs((prev) => prev.map((c) => (c.id === cfg.id ? { ...c, isEnabled } : c)));
    const result = await toggleToolConfig(userId, cfg.toolKey, isEnabled);
    if (!result.success) {
      toast.error('Error al cambiar estado');
      setConfigs((prev) => prev.map((c) => (c.id === cfg.id ? { ...c, isEnabled: !isEnabled } : c)));
    }
  };

  const handleDelete = async () => {
    if (!deleteCfg) return;
    const result = await deleteToolConfig(userId, deleteCfg.toolKey);
    if (result.success) { toast.success('Herramienta eliminada'); setDeleteCfg(null); loadConfigs(); }
    else { toast.error(result.error ?? 'Error al eliminar'); throw new Error(result.error); }
  };

  const builtinConfigs = configs.filter((c) => c.toolCategory === 'builtin');
  const dataQueryConfigs = configs.filter((c) => c.toolCategory === 'data_query');
  const existingBuiltinTypes = new Set(builtinConfigs.map((c) => c.toolType));
  const hasNoConfigs = configs.length === 0 && !isLoading;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Herramientas IA</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={loadConfigs} disabled={isLoading} title="Recargar">
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              </Button>
              {!isLoading && configs.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {configs.length} herramienta{configs.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
          <CardDescription>
            Define qué herramientas tiene disponibles tu agente IA.
            Las herramientas del sistema tienen lógica fija; las dinámicas son consultas configurables sobre tus datos cargados.
          </CardDescription>
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-5">
          {hasNoConfigs ? (
            <Alert className="border-amber-500/50 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="space-y-3">
                <p className="text-sm">
                  No tienes herramientas configuradas. Aplica la configuración base del sistema para empezar.
                </p>
                <Button onClick={handleApplyDefaults} disabled={isApplyingDefaults} size="sm" className="gap-2">
                  {isApplyingDefaults ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Aplicar herramientas del sistema por defecto
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-green-500" />
                El agente usa exactamente estas herramientas — sin configuración adicional.
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setAddBuiltinOpen(true)} className="gap-2">
                  <Lock className="h-3.5 w-3.5" />Herramienta del sistema
                </Button>
                <Button size="sm" onClick={() => { setEditDataQueryCfg(null); setDataQueryOpen(true); }} className="gap-2">
                  <Search className="h-3.5 w-3.5" />Nueva consulta dinámica
                </Button>
              </div>
            </div>
          )}

          {builtinConfigs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Lock className="h-3 w-3" />Herramientas del sistema
                <Separator className="flex-1" />
                <span className="normal-case font-normal">Implementación fija · solo nombre y descripción editables</span>
              </div>
              <div className="space-y-2">
                {builtinConfigs.map((cfg) => (
                  <ToolCard key={cfg.id} cfg={cfg} onToggle={handleToggle}
                    onEdit={() => setEditBuiltinCfg(cfg)} onDelete={() => setDeleteCfg(cfg)} />
                ))}
              </div>
            </div>
          )}

          {dataQueryConfigs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Search className="h-3 w-3" />Herramientas de consulta dinámica
                <Separator className="flex-1" />
                <span className="normal-case font-normal">Configuración 100% personalizable</span>
              </div>
              <div className="space-y-2">
                {dataQueryConfigs.map((cfg) => (
                  <ToolCard key={cfg.id} cfg={cfg} onToggle={handleToggle}
                    onEdit={() => { setEditDataQueryCfg(cfg); setDataQueryOpen(true); }}
                    onDelete={() => setDeleteCfg(cfg)} />
                ))}
              </div>
            </div>
          )}

          {configs.length > 0 && dataQueryConfigs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground border border-dashed rounded-lg">
              <Search className="h-8 w-8 opacity-15" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Sin herramientas de consulta dinámica</p>
                <p className="text-xs max-w-sm">
                  Créalas para que el agente pueda buscar datos por campos específicos (cédula, correo, contrato, etc.)
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setEditDataQueryCfg(null); setDataQueryOpen(true); }} className="gap-2">
                <Plus className="h-4 w-4" />Nueva consulta dinámica
              </Button>
            </div>
          )}
        </div>
      )}

      <AddBuiltinDialog open={addBuiltinOpen} onClose={() => setAddBuiltinOpen(false)}
        existingToolTypes={existingBuiltinTypes} onAdd={handleAddBuiltin} />
      <EditBuiltinDialog open={!!editBuiltinCfg} cfg={editBuiltinCfg}
        onClose={() => setEditBuiltinCfg(null)} onSave={handleEditBuiltin} onRestore={handleRestoreBuiltin} />
      <DataQueryDialog open={dataQueryOpen} editingConfig={editDataQueryCfg}
        onClose={() => { setDataQueryOpen(false); setEditDataQueryCfg(null); }} onSave={handleSaveDataQuery} />
      <DeleteDialog cfg={deleteCfg} onClose={() => setDeleteCfg(null)} onConfirm={handleDelete} />
    </div>
  );
}
