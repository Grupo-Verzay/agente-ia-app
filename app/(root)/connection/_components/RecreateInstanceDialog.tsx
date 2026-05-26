'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { forceRecreateInstance } from '@/actions/api-action'

interface Props {
  open: boolean
  setOpen: (open: boolean) => void
  userId: string
  instanceType: string
}

export const RecreateInstanceDialog = ({ open, setOpen, userId, instanceType }: Props) => {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleRecreate = async () => {
    setLoading(true)
    toast.loading('Recreando instancia...', { id: 'recreate' })
    const result = await forceRecreateInstance(userId, instanceType)
    if (result.success) {
      toast.success(result.message, { id: 'recreate' })
      setOpen(false)
      router.refresh()
    } else {
      toast.error(result.message, { id: 'recreate' })
    }
    setLoading(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={loading ? undefined : setOpen}>
      <AlertDialogContent className="border-border">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Recrear instancia de WhatsApp?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>Se eliminará la instancia actual y se creará una nueva automáticamente.</p>
              <p className="font-medium text-foreground">
                Deberás escanear el código QR nuevamente para reconectar WhatsApp.
              </p>
              <p>Usa esta opción cuando haya fallos persistentes de conexión que no se resuelven solos.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(e) => {
              e.preventDefault()
              handleRecreate()
            }}
          >
            {loading
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <RefreshCw className="w-4 h-4 mr-2" />}
            Recrear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
