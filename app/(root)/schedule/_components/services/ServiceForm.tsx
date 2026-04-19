'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { createService } from '@/actions/service-action'

const formSchema = z.object({
    name: z.string().min(2, 'El nombre es obligatorio'),
    messageText: z.string().min(5, 'El mensaje debe ser más descriptivo'),
    description: z.string().min(5, 'El mensaje debe ser más descriptivo'),
})

type FormValues = z.infer<typeof formSchema>

export function ServiceForm({ userId }: { userId: string }) {
    const router = useRouter();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            messageText: '',
        },
    })

    const onSubmit = async (values: FormValues) => {
        const res = await createService({ ...values, userId })

        if (res.success) {
            toast.success(res.message)
            form.reset()
        } else {
            toast.error(res.message)
        }

        router.refresh();
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4 max-w-lg"
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nombre del servicio</FormLabel>
                            <FormControl>
                                <Input placeholder="Ej: Asesoría técnica" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="messageText"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Mensaje automático para WhatsApp</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="Ej: ¡Hola! Gracias por agendar. Te atenderemos puntualmente en tu cita."
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Este mensaje se enviará automáticamente al confirmar la cita.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" disabled={form.formState.isSubmitting}>
                    Guardar servicio
                </Button>
            </form>
        </Form>
    )
}