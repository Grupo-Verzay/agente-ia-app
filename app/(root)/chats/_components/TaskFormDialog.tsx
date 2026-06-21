"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ClipboardList, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { TASK_TYPES, type TaskData } from "@/lib/task-types";
import {
  createTaskAction,
  createCustomTaskTypeAction,
  deleteCustomTaskTypeAction,
  getAdvisorsForTaskAction,
  getCustomTaskTypesAction,
} from "@/actions/task-actions";
import type { Session } from "@/types/session";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session | null;
  currentUserId: string;
  currentUserName?: string | null;
  onCreated?: (task: TaskData) => void;
};

export function TaskFormDialog({
  open,
  onOpenChange,
  session,
  currentUserId,
  currentUserName,
  onCreated,
}: Props) {
  const [advisors, setAdvisors] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<string>("Seguimiento");
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const newTypeRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [assignedToId, setAssignedToId] = useState(currentUserId);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      getAdvisorsForTaskAction(),
      getCustomTaskTypesAction(),
    ]).then(([advisorsRes, types]) => {
      if (advisorsRes.success && advisorsRes.data) setAdvisors(advisorsRes.data);
      setCustomTypes(types);
      setLoading(false);
    });
  }, [open]);

  useEffect(() => {
    if (open) setAssignedToId(currentUserId);
  }, [open, currentUserId]);

  const handleAddType = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    const res = await createCustomTaskTypeAction(name);
    if (res.success) {
      setCustomTypes((prev) => [...prev, name]);
      setType(name);
      setAddingType(false);
      setNewTypeName("");
    } else {
      toast.error(res.message);
    }
  };

  const handleDeleteCustomType = async (t: string) => {
    const res = await deleteCustomTaskTypeAction(t);
    if (res.success) {
      setCustomTypes((prev) => prev.filter((c) => c !== t));
      if (type === t) setType("Seguimiento");
    } else {
      toast.error(res.message);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Escribe una descripción para la tarea."); return; }
    if (!dueDate) { toast.error("Selecciona una fecha de vencimiento."); return; }

    setSaving(true);
    const advisor = advisors.find((a) => a.id === assignedToId);
    const res = await createTaskAction({
      assignedToId,
      assignedToName: advisor?.name ?? advisor?.email ?? currentUserName ?? null,
      sessionId: session?.id,
      contactName: session?.pushName ?? null,
      contactJid: session?.remoteJid ?? null,
      title: title.trim(),
      type,
      dueDate: new Date(dueDate).toISOString(),
      sendWhatsApp,
    });
    setSaving(false);

    if (res.success && res.data) {
      toast.success("Tarea creada.");
      onCreated?.(res.data);
      onOpenChange(false);
      setTitle("");
      setType("Seguimiento");
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[585px] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Nueva tarea
            {session?.pushName && (
              <span className="text-sm font-normal text-muted-foreground">
                — {session.pushName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 space-y-3 overflow-y-auto py-1 px-1">
          {/* Tipo */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">TIPO</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...TASK_TYPES, ...customTypes].map((t) => (
                  <SelectItem key={t} value={t} className="group pr-1">
                    <div className="flex items-center justify-between gap-2 w-full">
                      <span>{t}</span>
                      {customTypes.includes(t) && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void handleDeleteCustomType(t); }}
                          className="ml-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </SelectItem>
                ))}
                {/* Agregar tipo */}
                {addingType ? (
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <Input
                      ref={newTypeRef}
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); void handleAddType(); }
                        if (e.key === "Escape") { setAddingType(false); setNewTypeName(""); }
                      }}
                      placeholder="Nombre del tipo..."
                      className="h-7 text-xs flex-1"
                      autoFocus
                    />
                    <button type="button" onClick={() => void handleAddType()}
                      className="flex h-6 w-6 items-center justify-center rounded text-emerald-600 hover:bg-emerald-50">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => { setAddingType(false); setNewTypeName(""); }}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setAddingType(true); setTimeout(() => newTypeRef.current?.focus(), 50); }}
                    className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-sm transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar tipo
                  </button>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Descripción */}
          <div className="flex flex-col flex-1 min-h-0 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">DESCRIPCIÓN</label>
            <Textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Llamar para confirmar reunión, enviar propuesta, etc."
              className="flex-1 min-h-[120px] resize-none"
              autoFocus
            />
          </div>

          {/* Fecha */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">FECHA Y HORA</label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Asignado a */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">ASIGNADO A</label>
            {loading ? (
              <div className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Cargando asesores...
              </div>
            ) : (
              <Select value={assignedToId} onValueChange={setAssignedToId}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {advisors.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name ?? a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Recordatorio WhatsApp */}
        <div className="flex items-center gap-2 py-1 px-1">
          <Checkbox
            id="wa-reminder"
            checked={sendWhatsApp}
            onCheckedChange={(v) => setSendWhatsApp(!!v)}
          />
          <label htmlFor="wa-reminder" className="text-xs text-muted-foreground cursor-pointer select-none">
            Enviar recordatorio por WhatsApp al asesor asignado
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving} type="button">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear tarea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
