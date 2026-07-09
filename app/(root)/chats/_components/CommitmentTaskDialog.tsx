"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { createDetectedAppointmentAction, createTaskAction } from "@/actions/task-actions";
import type { DetectedCommitment } from "@/lib/commitment-detection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Props = {
  commitment: DetectedCommitment | null;
  assignedToId: string;
  assignedToName: string | null;
  sessionId?: number;
  contactName: string | null;
  contactJid: string | null;
  onClose: () => void;
};

const TASK_TYPES = ["Seguimiento", "Llamada", "Reunión", "Email", "Tarea"] as const;

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CommitmentTaskDialog(props: Props) {
  const { commitment, onClose } = props;
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DetectedCommitment["kind"]>("task");
  const [type, setType] = useState("Seguimiento");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!commitment) return;
    setTitle(commitment.title);
    setKind(commitment.kind);
    setType(commitment.type);
    setDueDate(toLocalInputValue(commitment.dueDate));
  }, [commitment]);

  const createTask = async () => {
    if (!commitment || !title.trim() || !dueDate) return;
    setSaving(true);
    const result = kind === "appointment"
      ? props.sessionId
        ? await createDetectedAppointmentAction({
            assignedToId: props.assignedToId,
            sessionId: props.sessionId,
            contactName: props.contactName,
            title: title.trim(),
            startTime: new Date(dueDate).toISOString(),
          })
        : { success: false, message: "El chat no tiene una sesión para crear la cita." }
      : await createTaskAction({
          assignedToId: props.assignedToId,
          assignedToName: props.assignedToName,
          sessionId: props.sessionId,
          contactName: props.contactName,
          contactJid: props.contactJid,
          title: title.trim(),
          type: kind === "reminder" ? "Seguimiento" : type,
          dueDate: new Date(dueDate).toISOString(),
        });
    setSaving(false);
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    toast.success(kind === "appointment" ? "Cita creada en la agenda." : kind === "reminder" ? "Recordatorio creado." : "Tarea creada y vinculada al cliente.");
    onClose();
  };

  return (
    <Dialog open={Boolean(commitment)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5 text-primary" />
            Compromiso detectado
          </DialogTitle>
          <DialogDescription>Revisa la tarea antes de crearla para este cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="commitment-title">Tarea</Label>
            <Input id="commitment-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Crear como</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as DetectedCommitment["kind"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Tarea</SelectItem>
                  <SelectItem value="reminder">Recordatorio</SelectItem>
                  <SelectItem value="appointment">Cita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {kind !== "appointment" && (
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="commitment-date">Fecha y hora</Label>
              <Input id="commitment-date" type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Ignorar</Button>
          <Button type="button" onClick={createTask} disabled={saving || !title.trim() || !dueDate}>
            {saving ? "Creando..." : kind === "appointment" ? "Crear cita" : kind === "reminder" ? "Crear recordatorio" : "Crear tarea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
