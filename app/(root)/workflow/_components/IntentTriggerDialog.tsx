"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { IntentTrigger, Workflow } from "@prisma/client"
import { createIntentTrigger, updateIntentTrigger, IntentTriggerPayload } from "@/actions/intent-trigger-actions"

interface Props {
    userId: string
    workflows: Workflow[]
    trigger?: IntentTrigger | null
    open: boolean
    onOpenChange: (v: boolean) => void
    onSaved: () => void
    fixedWorkflowId?: string
    fixedWorkflowName?: string
}

export function IntentTriggerDialog({ userId, workflows, trigger, open, onOpenChange, onSaved, fixedWorkflowId, fixedWorkflowName }: Props) {
    const isEdit = !!trigger

    const [name, setName] = useState("")
    const [condition, setCondition] = useState("")
    const [workflowId, setWorkflowId] = useState("")
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (open) {
            setName(trigger?.name ?? "")
            setCondition(trigger?.condition ?? "")
            setWorkflowId(trigger?.workflowId ?? fixedWorkflowId ?? "")
        }
    }, [open, trigger, fixedWorkflowId])

    const handleSave = async () => {
        if (!name.trim()) return toast.error("El nombre es obligatorio.")
        if (!condition.trim()) return toast.error("La descripción de la intención es obligatoria.")
        if (!workflowId) return toast.error("Selecciona un flujo.")

        setSaving(true)
        try {
            const payload: IntentTriggerPayload = { name, mode: "prompt", condition, workflowId }
            const res = isEdit
                ? await updateIntentTrigger(trigger!.id, payload)
                : await createIntentTrigger(userId, payload)

            if (!res.success) return toast.error(res.message ?? "Error al guardar.")
            toast.success(isEdit ? "Disparador actualizado." : "Disparador creado.")
            onSaved()
            onOpenChange(false)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        {isEdit ? "Editar disparador IA" : "Nuevo disparador IA"}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium">Nombre del disparador</label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ej: Intención de compra"
                            className="h-8 text-sm"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium">Descripción de la intención</label>
                        <Textarea
                            value={condition}
                            onChange={(e) => setCondition(e.target.value)}
                            placeholder="El usuario quiere comprar o pregunta por precios o disponibilidad"
                            rows={3}
                            className="resize-none text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">
                            La IA analiza el mensaje del cliente y dispara este flujo si coincide con la intención descrita.
                        </p>
                    </div>

                    {!fixedWorkflowId && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium">Flujo a ejecutar</label>
                            <Select value={workflowId} onValueChange={setWorkflowId}>
                                <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder="Seleccionar flujo..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {workflows.map((w) => (
                                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {fixedWorkflowId && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium">Flujo a ejecutar</label>
                            <div className="h-8 flex items-center px-3 rounded-md border border-input bg-muted text-sm text-muted-foreground">
                                {fixedWorkflowName ?? "Flujo seleccionado"}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isEdit ? "Actualizar" : "Crear disparador"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
