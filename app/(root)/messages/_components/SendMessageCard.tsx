'use client'

import * as React from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Send } from 'lucide-react'
import { useSendMessageWithHistory } from '@/hooks/useSendMessageWithHistory'
import { toast } from 'sonner'
import type { UserWithApiKeys } from '../../../../schema/schema'

type Props = {
    user: UserWithApiKeys
}

export default function SendMessageCard({ user }: Props) {
    const userUrl = user.apiKey?.url
    const userApiKey = user.apiKey?.key
    const userInstance = user.instancias?.[0]?.instanceName

    const sendTextUrl = userUrl && userInstance ? `https://${userUrl}/message/sendText/${userInstance}` : ''

    const [remoteJid, setRemoteJid] = React.useState('573107964105@s.whatsapp.net')
    const [text, setText] = React.useState('')

    const { sendMessage, isPending } = useSendMessageWithHistory({
        instanceName: userInstance ?? '',
        url: sendTextUrl,
        apikey: userApiKey ?? '',
        remoteJid,
        additionalKwargs: {
            source: 'SendMessageCard',
            userId: user.id,
        },
    })

    const hasConfig = !!sendTextUrl && !!userApiKey
    const canSend = hasConfig && remoteJid.trim().length > 0 && text.trim().length > 0 && !isPending

    const onSend = () => {
        if (!hasConfig) {
            return toast.error('Este usuario no tiene configuracion (url/apikey/instancia) para enviar mensajes.')
        }
        if (!remoteJid.trim() || !text.trim()) {
            return toast.error('Faltan datos: RemoteJid y mensaje.')
        }
        if (isPending) return

        sendMessage(text, {
            historyType: 'notification',
            onSuccess: () => {
                toast.success('Mensaje enviado')
                setText('')
            },
            onError: (error) => {
                toast.error(error || 'No se pudo enviar')
            },
        })
    }

    return (
        <Card className="rounded-2xl">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <CardTitle className="text-base">Enviar mensaje (WhatsApp)</CardTitle>
                    </div>

                    {!!remoteJid.trim() && (
                        <Badge variant="secondary" className="text-xs font-mono">
                            {remoteJid}
                        </Badge>
                    )}
                </div>

                {!hasConfig && (
                    <p className="text-xs text-destructive mt-2">
                        Falta configuracion del usuario (apiKey / url / instancia).
                    </p>
                )}
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="grid gap-2">
                    <Label className="text-xs">RemoteJid</Label>
                    <Input
                        value={remoteJid}
                        onChange={(e) => setRemoteJid(e.target.value)}
                        placeholder="573107964105@s.whatsapp.net"
                        className="h-9 text-sm font-mono"
                    />
                </div>

                <div className="grid gap-2">
                    <Label className="text-xs">Mensaje</Label>
                    <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Escribe tu mensaje..."
                        className="min-h-[110px] text-sm"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{text.trim().length} caracteres</span>
                        <span className="font-mono">delay=1200</span>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                    <Button onClick={onSend} disabled={!canSend} className="gap-2">
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Enviar
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
