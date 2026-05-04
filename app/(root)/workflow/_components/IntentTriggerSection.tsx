"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { Pencil, Plus, Trash2, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { IntentTrigger, Workflow } from "@prisma/client"
import { deleteIntentTrigger, toggleIntentTrigger } from "@/actions/intent-trigger-actions"
import { IntentTriggerDialog } from "./IntentTriggerDialog"

interface Props {
    userId: string
    initialTriggers: IntentTrigger[]
    workflows: Workflow[]
}

export function IntentTriggerSection({ userId, initialTriggers, workflows }: Props) {
    const [triggers, setTriggers] = useState<IntentTrigger[]>(initialTriggers)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<IntentTrigger | null>(null)

    const reload = useCallback(async () => {
        const { getIntentTriggersByUser } = await import("@/actions/intent-trigger-actions")
        const res = await getIntentTriggersByUser(userId)
        if (res.success && res.data) setTriggers(res.data as IntentTrigger[])
    }, [userId])

    const handleToggle = async (id: string, current: boolean) => {
        setTriggers(prev => prev.map(t => t.id === id ? { ...t, isActive: !current } : t))
        const res = await toggleIntentTrigger(id, !current)
        if (!res.success) {
            setTriggers(prev => prev.map(t => t.id === id ? { ...t, isActive: current } : t))
            toast.error("Error al cambiar estado.")
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("¿Eliminar este disparador?")) return
        setTriggers(prev => prev.filter(t => t.id !== id))
        const res = await deleteIntentTrigger(id)
        if (!res.success) {
            toast.error("Error al eliminar.")
            reload()
        }
    }

    const handleNew = () => {
        setEditing(null)
        setDialogOpen(true)
    }

    const handleEdit = (trigger: IntentTrigger) => {
        setEditing(trigger)
        setDialogOpen(true)
    }

    const workflowName = (id: string) =>
        workflows.find(w => w.id === id)?.name ?? "Flujo eliminado"

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <h3 className="text-sm font-semibold">Disparadores por IA</h3>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {triggers.length} configurados
                    </span>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleNew}>
                    <Plus className="h-3 w-3" /> Agregar
                </Button>
            </div>

            {triggers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                    <Zap className="h-6 w-6 text-muted-foreground mx-auto mb-2 opacity-50" />
                    <p className="text-xs text-muted-foreground">Sin disparadores configurados.</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        Los disparadores activan flujos automáticamente cuando la IA detecta una intención en el mensaje del usuario.
                    </p>
                    <Button size="sm" variant="outline" className="mt-3 h-7 text-xs gap-1" onClick={handleNew}>
                        <Plus className="h-3 w-3" /> Crear primer disparador
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    {triggers.map((trigger) => (
                        <div
                            key={trigger.id}
                            className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                        >
                            <Switch
                                checked={trigger.isActive}
                                onCheckedChange={() => handleToggle(trigger.id, trigger.isActive)}
                                className="mt-0.5 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-medium truncate">{trigger.name}</span>
                                    <Badge
                                        variant="secondary"
                                        className={`text-[10px] px-1.5 py-0 h-4 ${trigger.mode === "prompt"
                                            ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                                            : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                            }`}
                                    >
                                        {trigger.mode === "prompt" ? "Prompt IA" : "Keywords"}
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                    {trigger.condition}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                    → <span className="font-medium text-foreground">{workflowName(trigger.workflowId)}</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={() => handleEdit(trigger)}
                                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    title="Editar"
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    onClick={() => handleDelete(trigger.id)}
                                    className="rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                    title="Eliminar"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <IntentTriggerDialog
                userId={userId}
                workflows={workflows}
                trigger={editing}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSaved={reload}
            />
        </div>
    )
}
