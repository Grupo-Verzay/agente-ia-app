'use client'

import { useEffect, useState } from 'react'
import { Eye, Pencil, UserX, Users, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  getTeamAccounts, getNoteShares, setNoteShare,
  type TeamAccount, type NoteSharePermission,
} from '@/actions/notes-actions'

interface Props {
  open: boolean
  onClose: () => void
  noteId: string
  /** Cuenta dueña (la que está viendo la nota). */
  ownerId: string
}

const OPTIONS: { value: NoteSharePermission; label: string; icon: typeof Eye }[] = [
  { value: 'none', label: 'Sin acceso', icon: UserX },
  { value: 'read', label: 'Solo lectura', icon: Eye },
  { value: 'edit', label: 'Puede editar', icon: Pencil },
]

export function ShareNoteDialog({ open, onClose, noteId, ownerId }: Props) {
  const [accounts, setAccounts] = useState<TeamAccount[]>([])
  const [perms, setPerms] = useState<Record<string, NoteSharePermission>>({})
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([getTeamAccounts(ownerId), getNoteShares(noteId, ownerId)])
      .then(([teamRes, sharesRes]) => {
        if (teamRes.success) setAccounts(teamRes.data)
        const map: Record<string, NoteSharePermission> = {}
        if (sharesRes.success) {
          for (const s of sharesRes.data) map[s.userId] = s.canEdit ? 'edit' : 'read'
        }
        setPerms(map)
      })
      .catch(() => toast.error('No se pudo cargar el equipo'))
      .finally(() => setLoading(false))
  }, [open, noteId, ownerId])

  const handleSet = async (accountId: string, permission: NoteSharePermission) => {
    const prev = perms[accountId] ?? 'none'
    if (prev === permission) return
    setPerms(p => ({ ...p, [accountId]: permission }))
    setSavingId(accountId)
    const res = await setNoteShare(noteId, ownerId, accountId, permission)
    setSavingId(null)
    if (!res.success) {
      setPerms(p => ({ ...p, [accountId]: prev }))
      toast.error(res.error ?? 'No se pudo compartir')
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[585px] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Compartir con el equipo
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading && (
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-6">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando equipo...
            </p>
          )}

          {!loading && accounts.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No hay otras cuentas en tu equipo para compartir.
            </p>
          )}

          {!loading && accounts.map(acc => {
            const current = perms[acc.id] ?? 'none'
            return (
              <div key={acc.id} className="flex flex-col gap-2 py-3 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {(acc.name ?? acc.email).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{acc.name ?? acc.email}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{acc.email}</p>
                  </div>
                  {savingId === acc.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto shrink-0" />}
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {OPTIONS.map(opt => {
                    const Icon = opt.icon
                    const active = current === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => handleSet(acc.id, opt.value)}
                        disabled={savingId === acc.id}
                        className={cn(
                          'flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs transition-colors disabled:opacity-50',
                          active
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'border-border text-muted-foreground hover:bg-muted',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[11px] text-muted-foreground shrink-0 pt-1">
          Las cuentas con acceso verán esta nota en su pestaña <span className="font-medium">Compartidas</span>.
        </p>
      </DialogContent>
    </Dialog>
  )
}
