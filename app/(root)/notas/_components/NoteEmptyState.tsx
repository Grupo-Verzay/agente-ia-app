'use client'

import { NotebookPen, PanelLeftOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onNewNote: () => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function NoteEmptyState({ onNewNote, sidebarOpen, onToggleSidebar }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      {!sidebarOpen && (
        <Button variant="ghost" size="sm" onClick={onToggleSidebar} className="absolute top-2 left-2 gap-1.5 text-muted-foreground">
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      )}
      <div className="rounded-2xl border p-6 opacity-70">
        <NotebookPen className="h-8 w-8" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">Selecciona o crea una nota</p>
        <p className="text-xs text-muted-foreground">Tus notas aparecerán en el panel izquierdo</p>
      </div>
      <Button size="sm" onClick={onNewNote} className="mt-1 gap-1.5">
        <Plus className="h-4 w-4" />
        Nueva nota
      </Button>
    </div>
  )
}
