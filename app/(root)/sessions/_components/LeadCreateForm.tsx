// LeadCreateForm.tsx
"use client"

import { useForm } from "react-hook-form"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { registerSession } from "@/actions/session-action"
import { CreateLeadSchema, registerSessionSchema } from "@/schema/session"
import { jidDelTelefonoTecleado } from "@/lib/whatsapp-jid"

export const LeadCreateForm = ({ userId, instanceId, onCreated, onCancel }: registerSessionSchema) => {
    const router = useRouter();

    const form = useForm<CreateLeadSchema>({
        resolver: zodResolver(registerSessionSchema),
        defaultValues: {
            userId,
            instanceId,
            remoteJid: "",
            pushName: ""
        }
    })

    const { register, handleSubmit, formState: { errors } } = form

    const mutation = useMutation({
        mutationFn: async (values: CreateLeadSchema) => {
            // La MISMA regla que «Crear contacto»: solo los dígitos.
            const remoteJid = jidDelTelefonoTecleado(values.remoteJid);
            if (!remoteJid) {
                return { success: false, message: "Escribe el número completo, con el indicativo del país" } as Awaited<ReturnType<typeof registerSession>>;
            }
            const payload = { ...values, remoteJid };

            return await registerSession(payload);
        },
        onSuccess: (res) => {
            if (!res.success) return toast.error(res.message)
            toast.success("Lead creado correctamente")
            onCreated(form.getValues())
            router.refresh()
        },
        onError: () => toast.error("Error inesperado al crear lead")
    })

    const onSubmit = (values: CreateLeadSchema) => mutation.mutate(values)

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <input type="hidden" value={userId} {...register("userId")} />
            <input type="hidden" value={instanceId} {...register("instanceId")} />

            <Input placeholder="Número de teléfono" {...register("remoteJid")} />
            {errors.remoteJid && <p className="text-sm text-red-500">{errors.remoteJid.message}</p>}

            <Input placeholder="Nombre del lead" {...register("pushName")} />
            {errors.pushName && <p className="text-sm text-red-500">{errors.pushName.message}</p>}

            <div className="flex gap-2">
                {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>}
                <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Creando..." : "Crear lead"}
                </Button>
            </div>
        </form>
    )
}