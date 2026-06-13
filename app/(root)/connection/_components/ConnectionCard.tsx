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
import { Loader2, Lock, Info } from "lucide-react"
import { toast } from "sonner"
import { SubmitHandler, useForm } from "react-hook-form"
import { FormInstanceConnectionValues, FormInstanceConnectionSchema } from '@/schema/connection'
import { FaInstagram, FaFacebook, FaWhatsapp } from "react-icons/fa"
import { useMemo, useCallback } from "react"

interface MinimalUser {
    onFacebook?: boolean
    onInstagram?: boolean
}

interface ConnectionCardProps {
    user: MinimalUser
    loading: boolean
    defaultValues: FormInstanceConnectionValues
    instanceType: string // Facebook | Instagram | Whatsapp | ...
    handleSubmit: SubmitHandler<FormInstanceConnectionValues>
    checkNameAvailable?: (name: string) => Promise<boolean>
}

type WhatsAppAdapter = 'Whatsapp' | 'baileys'

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
                <span className="text-xl font-bold">Business QR</span>
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
    const type = (instanceType || '').trim().toLowerCase()
    const isWhatsapp = type === 'whatsapp' || type === 'whatsapp business' || type === 'whatsappb'
    const isFacebook = type === 'facebook'
    const isInstagram = type === 'instagram'
    const isFacebookOrInstagram = isFacebook || isInstagram

    // Hooks y Lógica
    const form = useForm<FormInstanceConnectionValues>({
        resolver: zodResolver(FormInstanceConnectionSchema),
        defaultValues: {
            ...defaultValues,
            instanceType,
        },
        mode: 'onSubmit',
    })

    const onSubmit = useCallback<SubmitHandler<FormInstanceConnectionValues>>(
        async (values, ev) => {
            if (checkNameAvailable) {
                const exists = await checkNameAvailable(values.instanceName)
                if (exists) {
                    toast.error('El nombre de instancia ya está en uso. Contacta a tu administrador.')
                    return
                }
            }
            const finalValues = isWhatsapp
                ? { ...values, instanceType: 'Whatsapp' as WhatsAppAdapter }
                : values
            handleSubmit(finalValues, ev)
        },
        [handleSubmit, checkNameAvailable, isWhatsapp]
    )

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
        <Card className="border-border flex-1 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-center p-6">
                <CardTitle className="text-center text-2xl font-bold flex items-center gap-2">
                    <SocialIconSelector instanceType={instanceType} />
                </CardTitle>
            </CardHeader>

            <Form {...form}>
                <form id="instance-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col">
                    <CardContent className="space-y-4 flex-1">
                        <FormField
                            control={form.control}
                            name="instanceName"
                            render={({ field }) => (
                                <>
                                    <FormItem className="hidden">
                                        <FormControl>
                                            <Input type="hidden" {...field} />
                                        </FormControl>
                                    </FormItem>
                                    <div className="space-y-1.5">
                                        <p className="text-sm font-medium text-muted-foreground">Nombre de instancia</p>
                                        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                                            <span className="flex-1 font-mono text-foreground">{field.value}</span>
                                            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        </div>
                                    </div>
                                </>
                            )}
                        />

                        {/* Campo oculto para el tipo de instancia */}
                        <FormField
                            control={form.control}
                            name="instanceType"
                            render={({ field }) => (
                                <FormItem className="hidden">
                                    <FormControl>
                                        <Input type="hidden" {...field} value={isWhatsapp ? 'Whatsapp' : instanceType} readOnly />
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