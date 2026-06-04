'use client'

import { useEffect, useState } from 'react'
import { Search, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { fmtPhone } from '@/lib/whatsapp-jid'

interface Contact {
  remoteJid: string
  pushName: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (contactJid: string, contactName: string) => void
  userId: string
}

export function NoteContactPicker({ open, onClose, onSelect, userId }: Props) {
  const [search, setSearch] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/notes/contacts?userId=${userId}&q=${encodeURIComponent(search)}`)
      .then(r => r.json())
      .then(data => { setContacts(data.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [open, search, userId])

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-sm h-[585px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Vincular contacto</DialogTitle>
        </DialogHeader>
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar contacto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {loading && <p className="text-xs text-muted-foreground text-center py-4">Cargando...</p>}
          {!loading && contacts.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Sin resultados</p>
          )}
          {contacts.map(c => (
            <button
              key={c.remoteJid}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-left transition-colors"
              onClick={() => { onSelect(c.remoteJid, c.pushName); onClose() }}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.pushName}</p>
                <p className="text-xs text-muted-foreground">{fmtPhone(c.remoteJid)}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
