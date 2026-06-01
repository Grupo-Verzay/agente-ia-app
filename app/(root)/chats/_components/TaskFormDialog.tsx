"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { TASK_TYPES } from "@/lib/task-types";
import {
  createTaskAction,
  getAdvisorsForTaskAction,
  type TaskData,
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
    getAdvisorsForTaskAction().then((res) => {
      if (res.success && res.data) setAdvisors(res.data);
      setLoading(false);
    });
  }, [open]);

  useEffect(() => {
    if (open) setAssignedToId(currentUserId);
  }, [open, currentUserId]);

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
      <DialogContent className="sm:max-w-md">
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

        <div className="space-y-3 py-1">
          {/* Tipo */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">TIPO</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Descripción */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">DESCRIPCIÓN</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Llamar para confirmar reunión"
              className="h-9"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
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
