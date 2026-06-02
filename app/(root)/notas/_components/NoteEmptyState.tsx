'use client'

import { FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NoteEmptyState({ onNewNote }: { onNewNote: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <FileText className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">Selecciona o crea una nota</p>
        <p className="text-xs text-muted-foreground">Tus notas aparecerán en el panel izquierdo</p>
      </div>
      <Button size="sm" onClick={onNewNote} className="gap-2">
        <Plus className="h-4 w-4" />
        Nueva nota
      </Button>
    </div>
  )
}
