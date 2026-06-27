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
                <span className="text-xl font-bold">Mensajería Instagram</span>
            </>
        )
    }
    if (t === 'facebook') {
        return (
            <>
                <FaFacebook className="text-[#1877F2] rounded-sm w-6 h-6" />
                <span className="text-xl font-bold">Mensajería Facebook</span>
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
            <Card className="border-border flex-1 flex flex-col">
                <CardHeader className="flex flex-row items-center justify-center px-6 py-4">
                    <CardTitle className="text-center text-2xl font-bold flex items-center gap-2">
                        <SocialIconSelector instanceType={instanceType} />
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-3 pt-0">
                    <div className="space-y-1.5">
                        <p className="text-sm font-medium text-muted-foreground">Nombre de instancia</p>
                        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                            <span className="flex-1 font-mono text-foreground">{defaultValues.instanceName}</span>
                            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="mt-auto px-6 pb-4 pt-0">
                    <Button variant="secondary" className="w-full cursor-not-allowed bg-muted-foreground/35 text-foreground/85 hover:bg-muted-foreground/35 font-semibold" disabled title="Contacta con un administrador para activar este canal.">
                        <Lock className="w-4 h-4 mr-2 text-amber-500 [filter:drop-shadow(0_0_5px_rgba(245,158,11,0.9))]" />
                        Canal no habilitado
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    // Renderizado Condicional: Tarjeta de Formulario
    return (
        <Card className="border-border flex-1 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-center px-6 py-4">
                <CardTitle className="text-center text-2xl font-bold flex items-center gap-2">
                    <SocialIconSelector instanceType={instanceType} />
                </CardTitle>
            </CardHeader>

            {/* Formulario oculto — solo campos para submit, sin afectar layout */}
            <Form {...form}>
                <form id="instance-form" onSubmit={form.handleSubmit(onSubmit)} className="hidden">
                    <FormField
                        control={form.control}
                        name="instanceName"
                        render={({ field }) => (
                            <FormItem><FormControl><Input type="hidden" {...field} /></FormControl></FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="instanceType"
                        render={({ field }) => (
                            <FormItem><FormControl>
                                <Input type="hidden" {...field} value={isWhatsapp ? 'Whatsapp' : instanceType} readOnly />
                            </FormControl></FormItem>
                        )}
                    />
                </form>
            </Form>

            <CardContent className="space-y-3 px-6 pb-3 pt-0">
                <div className="space-y-1.5">
                    <p className="text-sm font-medium text-muted-foreground">Nombre de instancia</p>
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                        <span className="flex-1 font-mono text-foreground">{defaultValues.instanceName}</span>
                        <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </div>
                </div>
            </CardContent>

            <CardFooter className="mt-auto px-6 pb-4 pt-0">
                <Button
                    type="submit"
                    form="instance-form"
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    disabled={loading}
                    aria-disabled={loading}
                >
                    {loading && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                    Crear instancia Business QR
                </Button>
            </CardFooter>
        </Card>
    )
}