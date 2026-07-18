'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Bot, ExternalLink, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createEvoUrl,
  deleteEvoUrl,
  getEvoUrls,
  updateEvoUrl,
  EvoSlot,
} from '@/actions/evo-url-action'
import { getEvoServers, forceDeleteEvoInstance } from '@/actions/evo-instance-admin-action'

const evoConfig = [
  { slot: 'evo0', slotNum: '0', label: 'EVO' },
  { slot: 'evo1', slotNum: '1', label: 'Evo 1' },
  { slot: 'evo2', slotNum: '2', label: 'Evo 2' },
  { slot: 'evo3', slotNum: '3', label: 'Evo 3' },
  { slot: 'evo4', slotNum: '4', label: 'Evo 4' },
  { slot: 'evo5', slotNum: '5', label: 'Evo 5' },
] as const

interface Props {
  userId: string
}

export const MainEvo = ({ userId }: Props) => {
  const router = useRouter()
  const [savedEvos, setSavedEvos] = useState<Record<string, { id: string; url: string }>>({})
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  // Herramienta: eliminar instancia huérfana (existe en Evolution pero no en la BD).
  const [servers, setServers] = useState<{ id: string; url: string }[]>([])
  const [serverChoice, setServerChoice] = useState<string>('manual')
  const [manualUrl, setManualUrl] = useState('')
  const [manualKey, setManualKey] = useState('')
  const [orphanName, setOrphanName] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const load = async () => {
      const result = await getEvoUrls(userId)
      if (result.success && result.data) {
        const map: Record<string, { id: string; url: string }> = {}
        const vals: Record<string, string> = {}
        for (const evo of result.data) {
          map[evo.name] = { id: evo.id, url: evo.description || '' }
          vals[evo.name] = evo.description || ''
        }
        setSavedEvos(map)
        setFormValues(vals)
      }

      const srv = await getEvoServers()
      if (srv.success && srv.data && srv.data.length > 0) {
        setServers(srv.data)
        setServerChoice(srv.data[0].id)
      }

      setLoading(false)
    }
    load()
  }, [userId])

  const handleForceDelete = async () => {
    const name = orphanName.trim()
    if (!name) return toast.error('Escribe el nombre exacto de la instancia.')
    if (serverChoice === 'manual' && (!manualUrl.trim() || !manualKey.trim())) {
      return toast.error('Pega la URL del servidor y su API Key.')
    }
    if (!confirm(`¿Eliminar la instancia "${name}" de Evolution? Esta acción no se puede deshacer.`)) return

    setDeleting(true)
    const payload =
      serverChoice === 'manual'
        ? { instanceName: name, serverUrl: manualUrl, apiKey: manualKey }
        : { instanceName: name, apiKeyId: serverChoice }
    const res = await forceDeleteEvoInstance(payload)
    setDeleting(false)

    if (res.success) {
      toast.success(res.message)
      setOrphanName('')
    } else {
      toast.error(res.message)
    }
  }

  const handleChange = (slot: string, value: string) => {
    setFormValues(prev => ({ ...prev, [slot]: value }))
  }

  const handleSave = async (slot: EvoSlot) => {
    const value = formValues[slot]
    if (!value) return toast.error('Ingresa una URL para guardar.')

    if (savedEvos[slot]) {
      toast.loading('Actualizando...', { id: slot })
      const result = await updateEvoUrl(savedEvos[slot].id, slot, value)
      if (result.success) {
        toast.success('Actualizado', { id: slot })
        setSavedEvos(prev => ({ ...prev, [slot]: { ...prev[slot], url: value } }))
      } else {
        toast.error(result.message, { id: slot })
      }
    } else {
      toast.loading('Guardando...', { id: slot })
      const result = await createEvoUrl(userId, slot, value)
      if (result.success && result.data) {
        toast.success('Guardado', { id: slot })
        setSavedEvos(prev => ({
          ...prev,
          [slot]: { id: result.data.id, url: result.data.description || '' },
        }))
      } else {
        toast.error(result.message || 'Error al guardar', { id: slot })
      }
    }
    router.refresh()
  }

  const handleDelete = async (slot: EvoSlot) => {
    const entry = savedEvos[slot]
    if (!entry) return toast.error('No hay URL guardada.')

    toast.loading('Eliminando...', { id: slot })
    const result = await deleteEvoUrl(entry.id)

    if (result.success) {
      toast.success('Eliminado', { id: slot })
      setFormValues(prev => ({ ...prev, [slot]: '' }))
      setSavedEvos(prev => {
        const copy = { ...prev }
        delete copy[slot]
        return copy
      })
    } else {
      toast.error(result.message, { id: slot })
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Cargando configuración...</p>
  }

  return (
    <div className="space-y-6">
      {/* Herramienta: eliminar instancia huérfana */}
      <Card className="border-amber-500/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Eliminar instancia huérfana
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Borra una instancia que quedó viva en Evolution API pero ya no existe en la app.
            Devuelve el error real del servidor si algo falla.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Servidor</Label>
              <Select value={serverChoice} onValueChange={setServerChoice}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Elige un servidor" /></SelectTrigger>
                <SelectContent>
                  {servers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.url}</SelectItem>
                  ))}
                  <SelectItem value="manual">Otro (pegar manualmente)…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Nombre de la instancia</Label>
              <Input
                placeholder="CARLOS_ARCOS"
                value={orphanName}
                onChange={(e) => setOrphanName(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {serverChoice === 'manual' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">URL del servidor Evolution</Label>
                <Input
                  placeholder="https://evoapi1.ia-app.com"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">API Key (global)</Label>
                <Input
                  type="password"
                  placeholder="apikey del servidor"
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleForceDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
              Forzar borrado
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {evoConfig.map(({ slot, slotNum, label }) => {
        const saved = savedEvos[slot]
        const isSaved = !!saved

        return (
          <Card key={slot} className={`border ${isSaved ? 'border-green-500/40' : 'border-border'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Bot className={`w-4 h-4 ${isSaved ? 'text-green-500' : 'text-muted-foreground'}`} />
                  {label}
                </span>
                {isSaved && (
                  <a
                    href={slot === 'evo0' ? '/evo' : `/evo?slot=${slotNum}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">URL del servidor</Label>
                <Input
                  placeholder="https://evoapi.miservidor.com/manager"
                  value={formValues[slot] || ''}
                  onChange={e => handleChange(slot, e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleSave(slot as EvoSlot)}
                >
                  {isSaved ? <RefreshCw className="w-3 h-3 mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                  {isSaved ? 'Actualizar' : 'Guardar'}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(slot as EvoSlot)}
                  disabled={!isSaved}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              {isSaved && (
                <p className="text-xs text-muted-foreground truncate" title={saved.url}>
                  {saved.url}
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
      </div>
    </div>
  )
}
