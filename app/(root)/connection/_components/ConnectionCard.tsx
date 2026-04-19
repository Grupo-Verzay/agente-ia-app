'use client'

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { zodResolver } from "@hookform/resolvers/zod"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Loader2, Lock } from "lucide-react"
import { SubmitHandler, useForm } from "react-hook-form"
import { FormInstanceConnectionValues, FormInstanceConnectionSchema, sanitizeInstanceNameInput } from '@/schema/connection'
import { FaInstagram, FaFacebook, FaWhatsapp } from "react-icons/fa"
import { useMemo, useCallback } from "react"

interface MinimalUser {
    onFacebook?: boolean
    onInstagram?: boolean
}

const MAX_INSTANCE_NAME_LENGTH = 30

interface ConnectionCardProps {
    user: MinimalUser
    loading: boolean
    defaultValues: FormInstanceConnectionValues
    instanceType: string // Facebook | Instagram | Whatsapp | ...
    handleSubmit: SubmitHandler<FormInstanceConnectionValues>
    checkNameAvailable?: (name: string) => Promise<boolean>
}

interface SocialIconSelectorProps {
    instanceType: string
}

const isStrictTrue = (v: unknown) => v === true

const SocialIconSelector = ({ instanceType }: SocialIconSelectorProps) => {
    const t = (instanceType || '').trim().toLowerCase()

    if (t === 'instagram') {
        return (
            <>
                <FaInstagram className="text-pink-500 rounded-sm w-6 h-6" />
                <span className="text-xl font-bold">Instagram</span>
            </>
        )
    }
    if (t === 'facebook') {
        return (
            <>
                <FaFacebook className="text-blue-500 rounded-sm w-6 h-6" />
                <span className="text-xl font-bold">Facebook</span>
            </>
        )
    }
    if (t === 'whatsapp' || t === 'whatsapp business' || t === 'whatsappb') {
        return (
            <>
                <FaWhatsapp className="text-green-500 rounded-sm w-6 h-6" />
                <span className="text-xl font-bold">WhatsApp</span>
            </>
        )
    }
    return <span className="text-xl font-bold">{instanceType || 'Canal'}</span>
}

export const ConnectionCard = ({
    user,
    handleSubmit,
    loading,
    defaultValues,
    instanceType,
    checkNameAvailable,
}: ConnectionCardProps) => {
    // Hooks y Lógica
    const form = useForm<FormInstanceConnectionValues>({
        resolver: zodResolver(FormInstanceConnectionSchema),
        defaultValues: {
            ...defaultValues,
            instanceType,
        },
        mode: 'onSubmit',
    })

    const instanceNameValue = form.watch('instanceName') ?? ''

    const onSubmit = useCallback<SubmitHandler<FormInstanceConnectionValues>>(
        async (values, ev) => {
            if (checkNameAvailable) {
                const exists = await checkNameAvailable(values.instanceName)
                if (exists) {
                    form.setError('instanceName', {
                        type: 'manual',
                        message: 'Este nombre ya está en uso. Elige otro.',
                    })
                    return
                }
            }
            handleSubmit(values, ev)
        },
        [handleSubmit, checkNameAvailable, form]
    )

    const type = (instanceType || '').trim().toLowerCase()
    const isFacebook = type === 'facebook'
    const isInstagram = type === 'instagram'
    const isFacebookOrInstagram = isFacebook || isInstagram
    const isChannelEnabled = useMemo(() => {
        if (isFacebook) return isStrictTrue(user.onFacebook)
        if (isInstagram) return isStrictTrue(user.onInstagram)
        return true
    }, [isFacebook, isInstagram, user.onFacebook, user.onInstagram])

    // Renderizado Condicional: Tarjeta de Bloqueo con Tema Dual
    if (isFacebookOrInstagram && !isChannelEnabled) {
        return (
            // <Card className="border-border max-w-60 text-center shadow-lg">
            <Card className="border-border flex-1">
                <CardHeader className="flex flex-col items-start justify-center p-6 space-y-3">
                    <div className="flex items-center gap-2">
                        <SocialIconSelector instanceType={instanceType} />
                    </div>

                </CardHeader>

                <CardContent className="flex flex-col items-center justify-center space-y-4 pt-0">

                    {/* ICONO: Azul en Claro, Ámbar en Oscuro */}
                    <Lock
                        className="h-8 w-8 
                                   text-blue-500/70 dark:text-amber-400"
                    />

                    <div
                        role="status"
                        aria-live="polite"
                        // RECUADRO: Azul en Claro, Ámbar en Oscuro, Sombra interior
                        className="p-4 rounded-lg w-full shadow-inner 
                                   border border-blue-200 dark:border-amber-900 
                                   bg-blue-50 dark:bg-amber-950/40 
                                   text-blue-700 dark:text-amber-300 
                                   shadow-blue-100/50 dark:shadow-amber-900/20"
                    >
                        <p className="font-medium text-center text-sm"> {/* UX: Texto más pequeño */}
                            Contacta con un administrador para activar este canal.
                        </p>
                    </div>

                </CardContent>
            </Card>
        )
    }

    // Renderizado Condicional: Tarjeta de Formulario
    return (
        <Card className="border-border flex-1">
            <CardHeader className="flex flex-row items-center justify-center p-6">
                <CardTitle className="text-center text-2xl font-bold flex items-center gap-2">
                    <SocialIconSelector instanceType={instanceType} />
                </CardTitle>
            </CardHeader>

            <Form {...form}>
                <form id="instance-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="instanceName"
                            render={({ field }) => (
                                <FormItem>
                                    <div className="flex items-center justify-between">
                                        <FormLabel>Nombre de la Instancia</FormLabel>
                                        <span className={`text-xs tabular-nums ${instanceNameValue.length >= MAX_INSTANCE_NAME_LENGTH ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                                            {instanceNameValue.length}/{MAX_INSTANCE_NAME_LENGTH}
                                        </span>
                                    </div>
                                    <FormControl>
                                        <Input
                                            placeholder="COMPANY_SA"
                                            maxLength={MAX_INSTANCE_NAME_LENGTH}
                                            {...field}
                                            onChange={e => field.onChange(sanitizeInstanceNameInput(e.target.value))}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Campo oculto para enviar el tipo de instancia */}
                        <FormField
                            control={form.control}
                            name="instanceType"
                            render={({ field }) => (
                                <FormItem className="hidden">
                                    <FormControl>
                                        <Input type="hidden" {...field} value={instanceType} readOnly />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </CardContent>

                    <CardFooter>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={loading}
                            aria-disabled={loading}
                            title="Crear Instancia"
                        >
                            {loading && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                            Crear Instancia
                        </Button>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    )
}