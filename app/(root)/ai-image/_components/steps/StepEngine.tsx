import { CheckCircle2, Minus, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { GENERATION_MODELS, IMAGE_QUALITY_OPTIONS } from '../ad-generator.constants'
import type { CustomStyle } from '../ad-generator.types'

const MIN_COUNT = 1
const MAX_COUNT = 10

interface StepEngineProps {
  selectedModel: string
  onSelectModel: (id: string) => void
  imageCount: number
  onImageCountChange: (count: number) => void
  imageQuality: string
  onImageQualityChange: (quality: string) => void
  sourceImagesCount: number
  outputsPerImage: number
  totalOutputs: number
  includeText: boolean
  selectedStyle: CustomStyle | undefined
  customPrompt: string
}

export const StepEngine = ({
  selectedModel,
  onSelectModel,
  imageCount,
  onImageCountChange,
  imageQuality,
  onImageQualityChange,
  sourceImagesCount,
  outputsPerImage,
  totalOutputs,
  includeText,
  selectedStyle,
  customPrompt,
}: StepEngineProps) => (
  <ScrollArea className="h-full pr-2">
    <div className="flex min-h-full flex-col gap-3 pb-1">
      {/* Model selection */}
      <div className="grid gap-3">
        {GENERATION_MODELS.map((model) => {
          const selected = selectedModel === model.id
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => onSelectModel(model.id)}
              className={`relative w-full rounded-2xl border p-4 text-left transition ${
                selected
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border/70 bg-muted/20 hover:border-primary/40'
              }`}
            >
              {selected && <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-primary" />}
              <div className="mb-1 flex items-center gap-2 pr-6">
                <p className="text-sm font-semibold">{model.name}</p>
                {model.id === 'gemini-3.1-flash-image-preview' && (
                  <Badge variant="secondary" className="rounded-full text-[10px]">
                    Pro
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{model.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Quantity stepper */}
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Variantes por imagen
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
            onClick={() => onImageCountChange(Math.max(MIN_COUNT, imageCount - 1))}
            disabled={imageCount <= MIN_COUNT}
          >
            <Minus className="h-4 w-4" />
          </Button>

          <div className="flex flex-1 flex-col items-center rounded-2xl border border-border/70 bg-background px-4 py-2 text-center">
            <span className="text-2xl font-bold leading-none">{imageCount}</span>
            <span className="mt-0.5 text-[10px] text-muted-foreground">
              {imageCount === 1 ? 'variante' : 'variantes'}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
            onClick={() => onImageCountChange(Math.min(MAX_COUNT, imageCount + 1))}
            disabled={imageCount >= MAX_COUNT}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 flex gap-1.5">
          {Array.from({ length: MAX_COUNT }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onImageCountChange(n)}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                n <= imageCount ? 'bg-primary' : 'bg-border'
              }`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {imageCount === 1
            ? 'Se genera 1 imagen por combinación.'
            : `Se generan ${imageCount} variantes únicas por combinación con seeds distintos.`}
        </p>
      </div>

      {/* Quality */}
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Calidad de generación
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {IMAGE_QUALITY_OPTIONS.map((option) => {
            const selected = imageQuality === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onImageQualityChange(option.id)}
                className={`relative rounded-2xl border p-3 text-left transition ${
                  selected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border/70 bg-background hover:border-primary/40'
                }`}
              >
                {selected && <CheckCircle2 className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />}
                <p className="pr-5 text-sm font-semibold">{option.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{option.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Lo que se generara</p>
          <div className="mt-3 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Productos</span>
              <span className="font-semibold">{sourceImagesCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Salidas por producto</span>
              <span className="font-semibold">{outputsPerImage}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Variantes</span>
              <span className="font-semibold">x{imageCount}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total estimado</span>
              <span className="font-semibold">{totalOutputs}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Texto en imagen</span>
              <span className="font-semibold">{includeText ? 'Si' : 'No'}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Direccion actual</p>
          <p className="mt-2 text-sm font-semibold">{selectedStyle?.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{selectedStyle?.description}</p>
          <Separator className="my-3" />
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Prompt base</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {customPrompt.trim() || 'Sin instrucciones extra. Se usara la plantilla y estilo seleccionados.'}
          </p>
        </div>
      </div>
    </div>
  </ScrollArea>
)
