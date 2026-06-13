"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Loader2, Plus, Trash2, Tag, UserCheck, Play, MessageCircle,
  Bell, Bot, Link, Webhook, RefreshCw, Pencil, CheckCircle2,
} from "lucide-react";
import type { StageActionType, StageActionConfig } from "@/actions/stage-automation-actions";
import {
  getReminderGroupAutomations, createReminderGroupAutomation, updateReminderGroupAutomation, deleteReminderGroupAutomation,
  addReminderGroupAutomationAction, updateReminderGroupAutomationAction, deleteReminderGroupAutomationAction,
  type ReminderGroupAutomationRow, type ReminderGroupAutomationActionRow,
} from "@/actions/reminder-group-automation-actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getAdvisorsForTaskAction } from "@/actions/task-actions";
import { getWorkFlowByUser } from "@/actions/workflow-actions";
import { listTagsAction } from "@/actions/tag-actions";

const ACTION_TYPES: { value: StageActionType; label: string; icon: React.ReactNode }[] = [
  { value: "TAG_ADD",        label: "Agregar tag",             icon: <Tag className="h-4 w-4" /> },
  { value: "TAG_REMOVE",     label: "Quitar tag",              icon: <Tag className="h-4 w-4" /> },
  { value: "ASSIGN",         label: "Asignar asesor",          icon: <UserCheck className="h-4 w-4" /> },
  { value: "TASK",           label: "Crear tarea",             icon: <CheckCircle2 className="h-4 w-4" /> },
  { value: "EXECUTE_FLOW",   label: "Ejecutar flujo",          icon: <Play className="h-4 w-4" /> },
  { value: "MESSAGE",        label: "Enviar mensaje",          icon: <MessageCircle className="h-4 w-4" /> },
  { value: "REMINDER",       label: "Recordatorio",            icon: <Bell className="h-4 w-4" /> },
  { value: "NOTIFY_ADVISOR", label: "Notificar asesor",        icon: <Bell className="h-4 w-4" /> },
  { value: "TOGGLE_AI",      label: "Activar / Desactivar IA", icon: <Bot className="h-4 w-4" /> },
  { value: "SEND_FILE",      label: "Enviar archivo",          icon: <Link className="h-4 w-4" /> },
  { value: "WEBHOOK",        label: "Webhook externo",         icon: <Webhook className="h-4 w-4" /> },
  { value: "CHANGE_STATUS",  label: "Cambiar estado lead",     icon: <RefreshCw className="h-4 w-4" /> },
];

function actionLabel(type: StageActionType, cfg: StageActionConfig): string {
  switch (type) {
    case "TAG_ADD":        return `Agregar tag #${cfg.tagId ?? "?"}`;
    case "TAG_REMOVE":     return `Quitar tag #${cfg.tagId ?? "?"}`;
    case "ASSIGN":         return `Asignar a asesor`;
    case "TASK":           return `Tarea: ${String(cfg.title ?? "sin título")}`;
    case "EXECUTE_FLOW":   return `Flujo: ${String(cfg.workflowName ?? "?")}`;
    case "MESSAGE":        return `Mensaje: "${String(cfg.text ?? "").slice(0, 30)}..."`;
    case "REMINDER":       return `Recordatorio en ${cfg.delayMinutes ?? 0} min`;
    case "NOTIFY_ADVISOR": return "Notificar asesor asignado";
    case "TOGGLE_AI":      return cfg.enabled ? "Activar IA" : "Desactivar IA";
    case "SEND_FILE":      return `Archivo: ${String(cfg.fileName ?? cfg.fileUrl ?? "?")}`;
    case "WEBHOOK":        return `Webhook: ${String(cfg.url ?? "?").slice(0, 40)}`;
    case "CHANGE_STATUS":  return `Cambiar estado a ${String(cfg.status ?? "?")}`;
    default:               return type;
  }
}

function ActionConfigForm({
  type, config, onChange, advisors, workflows, tags,
}: {
  type: StageActionType;
  config: StageActionConfig;
  onChange: (cfg: StageActionConfig) => void;
  advisors: { id: string; name: string | null; email: string }[];
  workflows: { id: string; name: string }[];
  tags: { id: number; name: string; color?: string | null }[];
}) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  switch (type) {
    case "TAG_ADD":
    case "TAG_REMOVE":
      return (
        <div className="space-y-2">
          <Label>Tag</Label>
          <Select value={String(config.tagId ?? "")} onValueChange={(v) => set("tagId", Number(v))}>
            <SelectTrigger><SelectValue placeholder="Selecciona un tag" /></SelectTrigger>
            <SelectContent>
              {tags.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    case "ASSIGN":
      return (
        <div className="space-y-2">
          <Label>Asesor</Label>
          <Select value={String(config.advisorId ?? "")} onValueChange={(v) => set("advisorId", v)}>
            <SelectTrigger><SelectValue placeholder="Selecciona asesor" /></SelectTrigger>
            <SelectContent>
              {advisors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name ?? a.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    case "TASK":
      return (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Título</Label>
            <Input value={String(config.title ?? "")} onChange={(e) => set("title", e.target.value)} placeholder="Título de la tarea" />
          </div>
          <div className="space-y-1">
            <Label>Descripción (opcional)</Label>
            <Textarea value={String(config.description ?? "")} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Descripción..." />
          </div>
          <div className="space-y-1">
            <Label>Asignar a (opcional)</Label>
            <Select value={String(config.advisorId ?? "")} onValueChange={(v) => set("advisorId", v)}>
              <SelectTrigger><SelectValue placeholder="Asesor asignado" /></SelectTrigger>
              <SelectContent>
                {advisors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name ?? a.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    case "EXECUTE_FLOW":
      return (
        <div className="space-y-2">
          <Label>Flujo</Label>
          <Select value={String(config.workflowName ?? "")} onValueChange={(v) => set("workflowName", v)}>
            <SelectTrigger><SelectValue placeholder="Selecciona flujo" /></SelectTrigger>
            <SelectContent>
              {workflows.map((w) => <SelectItem key={w.id} value={w.name}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    case "MESSAGE":
      return (
        <div className="space-y-2">
          <Label>Mensaje</Label>
          <Textarea value={String(config.text ?? "")} onChange={(e) => set("text", e.target.value)} rows={3} placeholder="Texto a enviar..." />
        </div>
      );
    case "REMINDER":
      return (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Mensaje del recordatorio</Label>
            <Textarea value={String(config.text ?? "")} onChange={(e) => set("text", e.target.value)} rows={2} placeholder="Texto..." />
          </div>
          <div className="space-y-1">
            <Label>Delay (minutos)</Label>
            <Input type="number" min={0} value={String(config.delayMinutes ?? 0)} onChange={(e) => set("delayMinutes", Number(e.target.value))} />
          </div>
        </div>
      );
    case "NOTIFY_ADVISOR":
      return (
        <div className="space-y-2">
          <Label>Mensaje (opcional)</Label>
          <Textarea value={String(config.message ?? "")} onChange={(e) => set("message", e.target.value)} rows={2} placeholder="Mensaje de notificación" />
        </div>
      );
    case "TOGGLE_AI":
      return (
        <div className="flex items-center gap-3">
          <Switch checked={Boolean(config.enabled)} onCheckedChange={(v) => set("enabled", v)} />
          <Label>{config.enabled ? "Activar agente IA" : "Desactivar agente IA"}</Label>
        </div>
      );
    case "SEND_FILE":
      return (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>URL del archivo</Label>
            <Input value={String(config.fileUrl ?? "")} onChange={(e) => set("fileUrl", e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1">
            <Label>Nombre del archivo (opcional)</Label>
            <Input value={String(config.fileName ?? "")} onChange={(e) => set("fileName", e.target.value)} placeholder="documento.pdf" />
          </div>
          <div className="space-y-1">
            <Label>Descripción (opcional)</Label>
            <Input value={String(config.caption ?? "")} onChange={(e) => set("caption", e.target.value)} placeholder="Texto que acompaña el archivo" />
          </div>
        </div>
      );
    case "WEBHOOK":
      return (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>URL</Label>
            <Input value={String(config.url ?? "")} onChange={(e) => set("url", e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1">
            <Label>Método</Label>
            <Select value={String(config.method ?? "POST")} onValueChange={(v) => set("method", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["POST", "GET", "PUT", "PATCH"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    case "CHANGE_STATUS":
      return (
        <div className="space-y-2">
          <Label>Nuevo estado lead</Label>
          <Select value={String(config.status ?? "")} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue placeholder="Selecciona estado" /></SelectTrigger>
            <SelectContent>
              {["FRIO", "TIBIO", "CALIENTE", "FINALIZADO", "DESCARTADO"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    default:
      return null;
  }
}

function ActionDialog({
  open, onClose, onSave, initial, advisors, workflows, tags,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (type: StageActionType, config: StageActionConfig, delayMinutes: number) => Promise<void>;
  initial?: ReminderGroupAutomationActionRow;
  advisors: { id: string; name: string | null; email: string }[];
  workflows: { id: string; name: string }[];
  tags: { id: number; name: string; color?: string | null }[];
}) {
  const [type, setType] = useState<StageActionType>(initial?.type ?? "MESSAGE");
  const [config, setConfig] = useState<StageActionConfig>(initial?.config ?? {});
  const [delay, setDelay] = useState(initial?.delayMinutes ?? 0);
  const [saving, startSave] = useTransition();

  useEffect(() => {
    if (open) {
      setType(initial?.type ?? "MESSAGE");
      setConfig(initial?.config ?? {});
      setDelay(initial?.delayMinutes ?? 0);
    }
  }, [open, initial]);

  const handleSave = () => {
    startSave(async () => {
      await onSave(type, config, delay);
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar acción" : "Nueva acción"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Tipo de acción</Label>
            <Select value={type} onValueChange={(v) => { setType(v as StageActionType); setConfig({}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((at) => (
                  <SelectItem key={at.value} value={at.value}>
                    <span className="flex items-center gap-2">{at.icon}{at.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ActionConfigForm type={type} config={config} onChange={setConfig} advisors={advisors} workflows={workflows} tags={tags} />
          <div className="space-y-1">
            <Label>Ejecutar después de (minutos, 0 = inmediato)</Label>
            <Input type="number" min={0} value={String(delay)} onChange={(e) => setDelay(Number(e.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AutomationCard({
  automation, onToggle, onDelete, onAddAction, onEditAction, onDeleteAction, advisors, workflows, tags,
}: {
  automation: ReminderGroupAutomationRow;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onAddAction: (automationId: string, type: StageActionType, cfg: StageActionConfig, delay: number) => Promise<void>;
  onEditAction: (automationId: string, actionId: string, type: StageActionType, cfg: StageActionConfig, delay: number) => Promise<void>;
  onDeleteAction: (automationId: string, actionId: string) => void;
  advisors: { id: string; name: string | null; email: string }[];
  workflows: { id: string; name: string }[];
  tags: { id: number; name: string; color?: string | null }[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editAction, setEditAction] = useState<ReminderGroupAutomationActionRow | null>(null);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">{automation.name}</span>
        <div className="flex items-center gap-2">
          <Switch checked={automation.enabled} onCheckedChange={(v) => onToggle(automation.id, v)} />
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(automation.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        {automation.actions.map((action) => (
          <div key={action.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
            <span className="text-muted-foreground truncate">{actionLabel(action.type, action.config)}</span>
            <div className="flex items-center gap-1 shrink-0">
              {action.delayMinutes > 0 && (
                <Badge variant="outline" className="text-[10px] h-4">{action.delayMinutes}m</Badge>
              )}
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditAction(action)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => onDeleteAction(automation.id, action.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => setAddOpen(true)}>
        <Plus className="h-3 w-3 mr-1" /> Agregar acción
      </Button>
      <ActionDialog
        open={addOpen} onClose={() => setAddOpen(false)}
        onSave={(type, cfg, delay) => onAddAction(automation.id, type, cfg, delay)}
        advisors={advisors} workflows={workflows} tags={tags}
      />
      <ActionDialog
        open={!!editAction} onClose={() => setEditAction(null)}
        onSave={(type, cfg, delay) => onEditAction(automation.id, editAction!.id, type, cfg, delay)}
        initial={editAction ?? undefined}
        advisors={advisors} workflows={workflows} tags={tags}
      />
    </div>
  );
}

export function ReminderGroupAutomationsPanel({
  userId,
  reminderGroup,
  groupLabel,
}: {
  userId: string;
  reminderGroup: string;
  groupLabel: string;
}) {
  const [automations, setAutomations] = useState<ReminderGroupAutomationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [advisors, setAdvisors] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: number; name: string; color?: string | null }[]>([]);

  const loadAutomations = useCallback(async () => {
    setLoading(true);
    const res = await getReminderGroupAutomations(reminderGroup);
    if (res.success && res.data) setAutomations(res.data);
    setLoading(false);
  }, [reminderGroup]);

  useEffect(() => { void loadAutomations(); }, [loadAutomations]);

  useEffect(() => {
    void Promise.all([
      getAdvisorsForTaskAction().then((r) => r.success && r.data ? setAdvisors(r.data) : null),
      getWorkFlowByUser(userId).then((r) => r.success && r.data ? setWorkflows(r.data) : null),
      listTagsAction(userId).then((r) => r.success && r.data ? setTags(r.data) : null),
    ]);
  }, [userId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const res = await createReminderGroupAutomation({ reminderGroup, name: newName.trim() });
    if (res.success && res.data) {
      setAutomations((prev) => [...prev, res.data!]);
      setNewName("");
    } else {
      toast.error(res.message ?? "Error al crear automación");
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    setAutomations((prev) => prev.map((a) => a.id === id ? { ...a, enabled } : a));
    await updateReminderGroupAutomation(id, { enabled });
  };

  const handleDelete = async (id: string) => {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
    const res = await deleteReminderGroupAutomation(id);
    if (!res.success) toast.error(res.message ?? "Error al eliminar");
  };

  const handleAddAction = async (automationId: string, type: StageActionType, cfg: StageActionConfig, delay: number) => {
    const res = await addReminderGroupAutomationAction(automationId, { type, config: cfg, delayMinutes: delay });
    if (res.success && res.data) {
      setAutomations((prev) => prev.map((a) =>
        a.id === automationId ? { ...a, actions: [...a.actions, res.data!] } : a,
      ));
      toast.success("Acción agregada");
    } else {
      toast.error(res.message ?? "Error al agregar acción");
    }
  };

  const handleEditAction = async (automationId: string, actionId: string, type: StageActionType, cfg: StageActionConfig, delay: number) => {
    const res = await updateReminderGroupAutomationAction(actionId, automationId, { type, config: cfg, delayMinutes: delay });
    if (res.success) {
      setAutomations((prev) => prev.map((a) =>
        a.id === automationId
          ? { ...a, actions: a.actions.map((ac) => ac.id === actionId ? { ...ac, type, config: cfg, delayMinutes: delay } : ac) }
          : a,
      ));
      toast.success("Acción actualizada");
    } else {
      toast.error(res.message ?? "Error al actualizar acción");
    }
  };

  const handleDeleteAction = async (automationId: string, actionId: string) => {
    setAutomations((prev) => prev.map((a) =>
      a.id === automationId ? { ...a, actions: a.actions.filter((ac) => ac.id !== actionId) } : a,
    ));
    await deleteReminderGroupAutomationAction(actionId, automationId);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-1">Automaciones — {groupLabel}</h3>
        <p className="text-xs text-muted-foreground">
          Acciones que se ejecutan automáticamente cuando un recordatorio entra en este grupo.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
        </div>
      ) : (
        <div className="space-y-3">
          {automations.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Sin automaciones para este grupo.
            </p>
          )}
          {automations.map((automation) => (
            <AutomationCard
              key={automation.id}
              automation={automation}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onAddAction={handleAddAction}
              onEditAction={handleEditAction}
              onDeleteAction={handleDeleteAction}
              advisors={advisors}
              workflows={workflows}
              tags={tags}
            />
          ))}
          <div className="flex gap-2 pt-1">
            <Input
              className="h-8 text-sm"
              placeholder="Nombre de la automación..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
            />
            <Button size="sm" className="h-8 shrink-0" onClick={() => void handleCreate()} disabled={!newName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Crear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
