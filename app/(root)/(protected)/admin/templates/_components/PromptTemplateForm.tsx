'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
    Form,
    FormField,
    FormItem,
    FormLabel,
    FormControl,
    FormMessage,
} from '@/components/ui/form'

export const PromptTemplateSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(3, 'Debe tener al menos 3 caracteres'),
    description: z.string().optional(),
    content: z.string().min(10, 'El content debe tener al menos 10 caracteres'),
    category: z.string().optional(),
    isActive: z.boolean().default(true),
    updatedAt: z.date().optional(),
    createdAt: z.date().optional(),
})

export type PromptTemplateFormValues = z.infer<typeof PromptTemplateSchema>

export function PromptTemplateForm({
    defaultValues,
    onSubmit,
}: {
    defaultValues?: Partial<PromptTemplateFormValues>
    onSubmit: (data: PromptTemplateFormValues) => void
}) {
    const form = useForm<PromptTemplateFormValues>({
        resolver: zodResolver(PromptTemplateSchema),
        defaultValues: {
            name: '',
            description: '',
            content: '',
            category: '',
            isActive: true,
            ...defaultValues,
        },
    })

    return (
        <Form {...form}>
            <form id="prompt-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-4">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nombre de la Plantilla</FormLabel>
                            <FormControl>
                                <Input placeholder="Ej: bienvenida_cliente" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Descripción</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Opcional: breve descripción" {...field} />
                            </FormControl>
                        </FormItem>
                    )}
                /> */}

                <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>URL Prompt</FormLabel>
                            <FormControl>
                                <Textarea
                                    rows={6}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Categoría</FormLabel>
                            <FormControl>
                                <Input placeholder="Ej: ventas, soporte, onboarding..." {...field} />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                        <FormItem className="flex items-center gap-4">
                            <FormLabel>¿Activa?</FormLabel>
                            <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={(checked) => field.onChange(checked)}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />
            </form>
        </Form>
    )
}