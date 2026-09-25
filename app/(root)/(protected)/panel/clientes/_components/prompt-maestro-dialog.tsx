'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ClientInterface } from '@/lib/types'
import { nombreDeLaCuenta } from '@/lib/nombre-de-la-cuenta'
import { TOPE_DEL_PROMPT_MAESTRO } from '@/lib/prompt-maestro-de-cuenta'
import {
    guardarPromptMaestroDeCuentaAction,
    leerPromptMaestroDeCuentaAction,
} from '@/actions/prompt-maestro-actions'

interface Props {
    user: ClientInterface
    open: boolean
    setOpen: (open: boolean) => void
}

/**
 * El prompt maestro PROPIO de una cuenta. Lo abre solo el dueño de la
 * plataforma (el menú de la fila lo esconde a los demás y las dos acciones lo
 * vuelven a comprobar en el servidor).
 *
 * Vacío = la cuenta usa el prompt maestro global, como siempre. Con texto,
 * ese texto SUSTITUYE al global para esa cuenta (no se suman).
 */
export const PromptMaestroDialog = ({ user, open, setOpen }: Props) => {
    const [texto, setTexto] = useState('')
    const [cargando, setCargando] = useState(false)
    const [guardando, setGuardando] = useState(false)

    useEffect(() => {
        if (!open) return
        let vigente = true
        setCargando(true)
        setTexto('')
        leerPromptMaestroDeCuentaAction(user.id)
            .then((r) => {
                if (!vigente) return
                if (!r.success) {
                    toast.error(r.message)
                    return
                }
                setTexto(r.data?.texto ?? '')
            })
            .catch((error) => {
                console.error('[prompt-maestro] no se pudo leer', error)
                if (vigente) toast.error('No se pudo leer el prompt maestro de la cuenta.')
            })
            .finally(() => {
                if (vigente) setCargando(false)
            })
        return () => {
            vigente = false
        }
    }, [open, user.id])

    const guardar = async () => {
        setGuardando(true)
        try {
            const r = await guardarPromptMaestroDeCuentaAction(user.id, texto)
            if (!r.success) {
                toast.error(r.message)
                return
            }
            toast.success(r.message)
            setOpen(false)
        } catch (error) {
            console.error('[prompt-maestro] no se pudo guardar', error)
            toast.error('No se pudo guardar el prompt maestro de la cuenta.')
        } finally {
            setGuardando(false)
        }
    }

    const vacio = !texto.trim()

    return (
        <Dialog open={open} onOpenChange={(v) => !guardando && setOpen(v)}>
            <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                    <DialogTitle>Prompt maestro de la cuenta</DialogTitle>
                    <DialogDescription>
                        {nombreDeLaCuenta(user)}. Vacío, la cuenta usa el prompt maestro global. Con texto, este
                        prompt reemplaza al global solo para esta cuenta. El cliente no lo ve.
                    </DialogDescription>
                </DialogHeader>
                <Textarea
                    aria-label="Prompt maestro de la cuenta"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    disabled={cargando || guardando}
                    placeholder={cargando ? 'Cargando…' : 'Vacío: usa el prompt maestro global.'}
                    className="min-h-[320px] font-mono text-sm"
                    maxLength={TOPE_DEL_PROMPT_MAESTRO}
                />
                <p className="text-xs text-muted-foreground">
                    {vacio
                        ? 'Esta cuenta usará el prompt maestro global.'
                        : `Esta cuenta usará este prompt en lugar del global · ${texto.length.toLocaleString('es-CO')} caracteres`}
                </p>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={guardando}>
                        Cancelar
                    </Button>
                    <Button variant="save" onClick={guardar} disabled={cargando || guardando}>
                        {guardando ? 'Guardando…' : 'Guardar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
