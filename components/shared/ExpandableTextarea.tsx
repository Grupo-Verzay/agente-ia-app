'use client'

import { useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  /** Título del diálogo al expandir */
  title?: string
  /** Texto de ayuda opcional bajo el título del diálogo */
  description?: string
  className?: string
}

/**
 * Textarea con botón para expandir en un diálogo grande y escribir cómodamente.
 * El valor se mantiene sincronizado entre la vista compacta y la expandida.
 */
export function ExpandableTextarea({
  value,
  onChange,
  placeholder,
  rows = 5,
  title = 'Editar mensaje',
  description,
  className,
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="relative">
        <Textarea
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`resize-y text-sm pr-9 ${className ?? ''}`}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Expandir"
          aria-label="Expandir editor"
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <Textarea
            autoFocus
            rows={18}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="resize-none text-sm min-h-[420px]"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
