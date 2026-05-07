"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { registerSession } from "@/actions/session-action"
import { getInstancesByUserId } from "@/actions/instances-actions"
import type { Instancia } from "@prisma/client"

export function CreateContactDialog({
    userId,
    onSuccess,
}: {
    userId: string
    onSuccess?: () => void
}) {
    const [open, setOpen] = useState(false)
    const [instanceId, setInstanceId] = useState("")
    const [instances, setInstances] = useState<Instancia[]>([])
    const [phone, setPhone] = useState("")
    const [name, setName] = useState("")
    const [errors, setErrors] = useState<{ phone?: string; name?: string }>({})
    const [isPending, setIsPending] = useState(false)

    const handleOpen = async () => {
        const res = await getInstancesByUserId(userId)
        const list = res.data ?? []
        setInstances(list)
        setInstanceId(list.length === 1 ? list[0].instanceName : "")
        setPhone("")
        setName("")
        setErrors({})
        setOpen(true)
    }

    const validate = () => {
        const next: { phone?: string; name?: string } = {}
        if (!phone.trim()) next.phone = "Número requerido"
        if (!name.trim()) next.name = "Nombre requerido"
        setErrors(next)
        return Object.keys(next).length === 0
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!validate()) return
        if (!instanceId) {
            toast.error("Selecciona una instancia.")
            return
        }
        setIsPending(true)
        try {
            const res = await registerSession({
                userId,
                instanceId,
                remoteJid: `${phone.trim()}@s.whatsapp.net`,
                pushName: name.trim(),
            })
            if (!res.success) {
                toast.error(res.message || "Error al crear contacto.")
                return
            }
            toast.success("Contacto creado correctamente.")
            setOpen(false)
            onSuccess?.()
        } finally {
            setIsPending(false)
        }
    }

    return (
        <>
            <Button
                onClick={handleOpen}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
            >
                + Nuevo
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Crear contacto</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
                        {instances.length > 1 && (
                            <div className="flex flex-col gap-1.5">
                                <Label>Instancia</Label>
                                <select
                                    value={instanceId}
                                    onChange={(e) => setInstanceId(e.target.value)}
                                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
                                >
                                    <option value="">Selecciona una instancia...</option>
                                    {instances.map((i) => (
                                        <option key={i.instanceName} value={i.instanceName}>
                                            {i.instanceName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="cc-phone">Número WhatsApp</Label>
                            <Input
                                id="cc-phone"
                                placeholder="57300000000"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                            />
                            {errors.phone && (
                                <p className="text-xs text-red-500">{errors.phone}</p>
                            )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="cc-name">Nombre</Label>
                            <Input
                                id="cc-name"
                                placeholder="Nombre del contacto"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                            {errors.name && (
                                <p className="text-xs text-red-500">{errors.name}</p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setOpen(false)}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={isPending}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                {isPending ? "Creando..." : "Crear"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}
