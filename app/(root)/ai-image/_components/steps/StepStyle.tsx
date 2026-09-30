'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
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
import type { CustomStyle } from '../ad-generator.types'

interface StepStyleProps {
  customStyles: CustomStyle[]
  selectedStyleId: string
  onSelectStyle: (id: string) => void
  isAddingStyle: boolean
  onToggleAddStyle: () => void
  newStyleName: string
  onNewStyleNameChange: (value: string) => void
  newStyleDesc: string
  onNewStyleDescChange: (value: string) => void
  onAddStyle: () => void
  onCancelAddStyle: () => void
  onDeleteStyle: (id: string) => void
  isSavingStyle: boolean
}

export const StepStyle = ({
  customStyles,
  selectedStyleId,
  onSelectStyle,
  isAddingStyle,
  onToggleAddStyle,
  newStyleName,
  onNewStyleNameChange,
  newStyleDesc,
  onNewStyleDescChange,
  onAddStyle,
  onCancelAddStyle,
  onDeleteStyle,
  isSavingStyle,
}: StepStyleProps) => {
  // El estilo que se va a borrar, a la espera de que se confirme. Borrar un
  // estilo propio no se deshace y antes bastaba un clic en una papelera de
  // 24 px pegada al nombre: se pide confirmación, con el nombre delante.
  const [porBorrar, setPorBorrar] = useState<CustomStyle | null>(null)

  return (
  <div className="flex h-full flex-col gap-4">
    <div data-zona="biblioteca" className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold">Biblioteca visual</p>
        <p className="text-xs text-muted-foreground">
          Elige un look &amp; feel existente o crea un estilo propio para esta imagen.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl"
        data-boton="crear-estilo"
        onClick={onToggleAddStyle}
      >
        <Sparkles className="mr-2 h-4 w-4" />
        Crear estilo
      </Button>
    </div>

    <AnimatePresence>
      {isAddingStyle && (
        <motion.div
          data-zona="nuevo-estilo"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden rounded-2xl border border-border/70 bg-muted/20"
        >
          <div className="space-y-3 p-4">
            <div className="space-y-2">
              <Label>Nombre del estilo</Label>
              <Input
                value={newStyleName}
                onChange={(e) => onNewStyleNameChange(e.target.value)}
                placeholder="Ej: Cyberpunk Premium"
                className="rounded-xl bg-background"
              />
            </div>

            <div className="space-y-2">
              <Label>Descripción del estilo</Label>
              <Textarea
                value={newStyleDesc}
                onChange={(e) => onNewStyleDescChange(e.target.value)}
                placeholder="Describe iluminación, fondo, atmósfera, materiales y estética…"
                className="min-h-[96px] resize-none rounded-xl bg-background"
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancelAddStyle} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={onAddStyle}
                disabled={isSavingStyle || !newStyleName.trim() || !newStyleDesc.trim()}
                className="rounded-xl"
              >
                {isSavingStyle ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  'Guardar estilo'
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    <ScrollArea className="min-h-0 flex-1 pr-2">
      <div data-zona="estilos" className="grid gap-3 pb-2 sm:grid-cols-2">
        {customStyles.map((style) => {
          const selected = selectedStyleId === style.id
          return (
            <div key={style.id} className="relative" data-estilo={style.id}>
              <button
                type="button"
                onClick={() => onSelectStyle(style.id)}
                aria-pressed={selected}
                className={`relative w-full rounded-2xl border p-4 text-left transition ${
                  selected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border/70 bg-muted/20 hover:border-primary/40'
                }`}
                title={style.description}
              >
                {/* Con papelera, el chulito va a su IZQUIERDA: en la misma
                    esquina los dos se montaban uno encima del otro y la
                    papelera tapaba la marca de «este es el elegido». */}
                {selected && (
                  <CheckCircle2
                    className={`absolute top-3 h-4 w-4 text-primary ${style.canDelete ? 'right-10' : 'right-3'}`}
                  />
                )}
                <p className={`text-sm font-semibold ${style.canDelete ? (selected ? 'pr-16' : 'pr-9') : 'pr-6'}`}>
                  {style.name}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{style.description}</p>
              </button>

              {style.canDelete && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  data-boton="borrar-estilo"
                  title={`Eliminar el estilo ${style.name}`}
                  aria-label={`Eliminar el estilo ${style.name}`}
                  className="absolute right-2 top-2 h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); setPorBorrar(style) }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </ScrollArea>

    <AlertDialog open={porBorrar !== null} onOpenChange={(abierto) => { if (!abierto) setPorBorrar(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar el estilo «{porBorrar?.name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Se quita de tu biblioteca visual y no se puede deshacer. Las imágenes que ya generaste con él no cambian.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            data-boton="confirmar-borrar-estilo"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (porBorrar) onDeleteStyle(porBorrar.id)
              setPorBorrar(null)
            }}
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
  )
}
