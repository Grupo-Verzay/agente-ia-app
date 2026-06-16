import { CheckCircle2, Sparkles, Wand2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { AD_FORMATS, MARKETING_TEMPLATES } from '../ad-generator.constants'

const DNA_CHIPS = [
  'Studio fondo blanco',
  'Fondo negro dramático',
  'Outdoor natural',
  'Mesa de mármol',
  'Minimalista limpio',
  'Dark luxury',
  'Degradado suave',
  'Bokeh desenfocado',
]
import type { AdFormat, MarketingTemplate } from '../ad-generator.types'

interface StepCampaignProps {
  includeText: boolean
  onIncludeTextChange: (value: boolean) => void
  isLandingKitMode: boolean
  onLandingKitModeChange: (value: boolean) => void
  selectedFormats: AdFormat[]
  onToggleFormat: (format: AdFormat) => void
  selectedTemplate: string
  onTemplateChange: (value: string) => void
  selectedTemplateMeta: MarketingTemplate
  visualDNA: string
  onVisualDNAChange: (value: string) => void
  customPrompt: string
  onCustomPromptChange: (value: string) => void
}

export const StepCampaign = ({
  includeText,
  onIncludeTextChange,
  isLandingKitMode,
  onLandingKitModeChange,
  selectedFormats,
  onToggleFormat,
  selectedTemplate,
  onTemplateChange,
  selectedTemplateMeta,
  visualDNA,
  onVisualDNAChange,
  customPrompt,
  onCustomPromptChange,
}: StepCampaignProps) => (
  <ScrollArea className="h-full pr-2">
    <div className="flex min-h-full flex-col gap-3 pb-1">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Texto</Label>
              <p className="text-sm font-medium">Incluir copy en la imagen</p>
            </div>
            <Switch checked={includeText} onCheckedChange={onIncludeTextChange} />
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Modo</Label>
              <p className="text-sm font-medium">Genera las 10 etapas</p>
            </div>
            <Switch checked={isLandingKitMode} onCheckedChange={onLandingKitModeChange} />
          </div>
        </div>
      </div>

      {/* Format selector — hidden in landing kit mode (always 1:1) */}
      {!isLandingKitMode && (
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Formatos a generar
          </p>
          <div className="grid grid-cols-3 gap-2">
            {AD_FORMATS.map((format) => {
              const selected = selectedFormats.includes(format.id)
              const isLast = selectedFormats.length === 1 && selected
              return (
                <button
                  key={format.id}
                  type="button"
                  onClick={() => onToggleFormat(format.id)}
                  disabled={isLast}
                  title={isLast ? 'Debe haber al menos un formato seleccionado' : undefined}
                  className={`relative rounded-2xl border px-3 py-3 text-center transition ${
                    selected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border/70 bg-background opacity-50 hover:opacity-80 hover:border-primary/40'
                  } disabled:cursor-not-allowed`}
                >
                  {selected && (
                    <CheckCircle2 className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />
                  )}
                  <p className="pr-4 text-xs font-semibold leading-tight">{format.name}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{format.sub}</p>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {selectedFormats.length === AD_FORMATS.length
              ? 'Se generarán los 3 formatos por imagen.'
              : `Se generará${selectedFormats.length > 1 ? 'n' : ''} ${selectedFormats.length} formato${selectedFormats.length > 1 ? 's' : ''} por imagen.`}
          </p>
        </div>
      )}

      {!isLandingKitMode ? (
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 space-y-2">
          <Label>Estructura de marketing</Label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {MARKETING_TEMPLATES.map((template) => {
              const isSelected = selectedTemplate === template.id
              const num = template.name.split('.')[0]
              const label = template.name.split('. ')[1]
              return (
                <button
                  key={template.id}
                  type="button"
                  title={label}
                  onClick={() => onTemplateChange(template.id)}
                  className={[
                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border/60 bg-background hover:border-primary/40',
                  ].join(' ')}
                >
                  <span className={[
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  ].join(' ')}>
                    {num}
                  </span>
                  <span className="truncate text-xs font-medium">{label}</span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground pt-0.5">{selectedTemplateMeta.description}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <Alert className="rounded-2xl border-border bg-background/80">
            <Sparkles className="h-4 w-4" />
            <AlertTitle>Modo kit landing activado</AlertTitle>
            <AlertDescription>
              Se generaran las 10 etapas de la landing para cada producto con una narrativa completa.
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 space-y-3">
        <div className="space-y-2">
          <Label htmlFor="visual-dna">ADN visual</Label>
          <Input
            id="visual-dna"
            value={visualDNA}
            onChange={(e) => onVisualDNAChange(e.target.value)}
            placeholder="Fondo, ambiente, iluminación y sensación general…"
            className="rounded-xl bg-background"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {DNA_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              title={chip}
              onClick={() => onVisualDNAChange(chip)}
              className={[
                'flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs transition',
                visualDNA === chip
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
              ].join(' ')}
            >
              <Wand2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{chip}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        <Label htmlFor="custom-prompt">Detalles específicos del anuncio</Label>
        <Textarea
          id="custom-prompt"
          value={customPrompt}
          onChange={(e) => onCustomPromptChange(e.target.value)}
          placeholder="Escena final, intención comercial o detalles que la IA no debe improvisar. Ej: reloj de lujo sobre mesa de mármol negro con iluminación dramática…"
          className="mt-2 min-h-[80px] resize-none rounded-xl bg-background"
          rows={3}
        />
      </div>
    </div>
  </ScrollArea>
)
