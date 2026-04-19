import { CheckCircle2, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
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
}: StepStyleProps) => (
  <div className="flex h-full flex-col gap-4">
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
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
        onClick={onToggleAddStyle}
      >
        <Sparkles className="mr-2 h-4 w-4" />
        Crear estilo
      </Button>
    </div>

    <AnimatePresence>
      {isAddingStyle && (
        <motion.div
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
              <Label>Descripcion del estilo</Label>
              <Textarea
                value={newStyleDesc}
                onChange={(e) => onNewStyleDescChange(e.target.value)}
                placeholder="Describe iluminacion, fondo, atmosfera, materiales y estetica..."
                className="min-h-[96px] rounded-xl resize-none bg-background"
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={onAddStyle} className="rounded-xl">
                Guardar estilo
              </Button>
              <Button type="button" variant="outline" onClick={onCancelAddStyle} className="rounded-xl">
                Cancelar
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    <ScrollArea className="min-h-0 flex-1 pr-2">
      <div className="grid gap-3 pb-2 sm:grid-cols-2">
        {customStyles.map((style) => {
          const selected = selectedStyleId === style.id
          return (
            <button
              key={style.id}
              type="button"
              onClick={() => onSelectStyle(style.id)}
              className={`relative rounded-2xl border p-4 text-left transition ${
                selected
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border/70 bg-muted/20 hover:border-primary/40'
              }`}
              title={style.description}
            >
              {selected && <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-primary" />}
              <p className="pr-6 text-sm font-semibold">{style.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{style.description}</p>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  </div>
)
