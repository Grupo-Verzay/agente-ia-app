'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { KeyRound, ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveUserGoogleApiKey } from '@/actions/ai-image-actions'

interface GoogleKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function GoogleKeyDialog({ open, onOpenChange, onSaved }: GoogleKeyDialogProps) {
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSave = async () => {
    const trimmed = apiKey.trim()
    if (!trimmed) {
      toast.error('Ingresa tu API key de Google')
      return
    }
    setLoading(true)
    try {
      const result = await saveUserGoogleApiKey(trimmed)
      if (!result.success) {
        toast.error(result.message)
        return
      }
      toast.success('API key configurada correctamente')
      setApiKey('')
      onOpenChange(false)
      onSaved()
      router.refresh()
    } catch {
      toast.error('Error al guardar la API key')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <KeyRound className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle>Configura tu API key de Google</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Necesitas una key de Google AI Studio para generar imágenes.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>API Key</Label>
            <Input
              type="password"
              placeholder="AIza••••••••••••••••••••••••••••••••••••"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              disabled={loading}
              autoFocus
            />
          </div>

          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Obtener mi API key en Google AI Studio
          </a>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="save" onClick={handleSave} disabled={loading || !apiKey.trim()}>
            {loading ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
