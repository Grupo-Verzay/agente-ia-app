import { CheckCircle2, Sparkles } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { AD_FORMATS, MARKETING_TEMPLATES } from '../ad-generator.constants'
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

      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        {!isLandingKitMode ? (
          <div className="space-y-2">
            <Label>Estructura de marketing</Label>
            <Select value={selectedTemplate} onValueChange={onTemplateChange}>
              <SelectTrigger className="rounded-xl bg-background">
                <SelectValue placeholder="Selecciona una estructura" />
              </SelectTrigger>
              <SelectContent>
                {MARKETING_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{selectedTemplateMeta.description}</p>
          </div>
        ) : (
          <Alert className="rounded-2xl border-border bg-background/80">
            <Sparkles className="h-4 w-4" />
            <AlertTitle>Modo kit landing activado</AlertTitle>
            <AlertDescription>
              Se generaran las 10 etapas de la landing para cada producto con una narrativa completa.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        <div className="space-y-2">
          <Label htmlFor="visual-dna">ADN visual</Label>
          <Input
            id="visual-dna"
            value={visualDNA}
            onChange={(e) => onVisualDNAChange(e.target.value)}
            placeholder="Define fondo, ambiente, iluminacion y sensacion general de la imagen."
            className="rounded-xl bg-background"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        <Label htmlFor="custom-prompt">Detalles especificos del anuncio</Label>
        <Textarea
          id="custom-prompt"
          value={customPrompt}
          onChange={(e) => onCustomPromptChange(e.target.value)}
          placeholder="Describe la escena final, la intencion comercial o cualquier detalle que no deba improvisar la IA.
          Ej: Un reloj de lujo sobre una mesa de marmol negro con iluminacion dramatica..."
          className="mt-2 min-h-[180px] rounded-xl resize-none bg-background"
        />
      </div>
    </div>
  </ScrollArea>
)
