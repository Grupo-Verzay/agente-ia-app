import { ChevronLeft, ChevronRight, Loader2, Sparkles, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { STUDIO_STEPS } from './ad-generator.constants'

interface StepFooterProps {
  currentStepIndex: number
  currentStepLabel: string
  currentStepHelper: string
  isLastStep: boolean
  isGenerating: boolean
  canMoveForward: boolean
  canGenerate: boolean
  isLandingKitMode: boolean
  error: string | null
  onPrevious: () => void
  onNext: () => void
  onGenerate: () => void
}

export const StepFooter = ({
  currentStepIndex,
  currentStepLabel,
  currentStepHelper,
  isLastStep,
  isGenerating,
  canMoveForward,
  canGenerate,
  isLandingKitMode,
  error,
  onPrevious,
  onNext,
  onGenerate,
}: StepFooterProps) => (
  <div className="border-t px-4 py-3">
    {error && (
      <Alert variant="destructive" className="mb-4 rounded-2xl">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )}

    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Paso {currentStepIndex + 1} de {STUDIO_STEPS.length}
        </p>
        <div className="flex flex-row justify-center gap-1 items-center">
          <p className="truncate text-sm font-semibold">{currentStepLabel}</p>
          <p className="truncate text-xs text-muted-foreground">{currentStepHelper}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={onPrevious}
          disabled={currentStepIndex === 0 || isGenerating}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Anterior
        </Button>

        {isLastStep ? (
          <Button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className="rounded-xl px-5"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {isLandingKitMode ? 'Generar kit' : 'Generar imagen'}
              </>
            )}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onNext}
            disabled={!canMoveForward || isGenerating}
            className="rounded-xl px-5"
          >
            Siguiente
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  </div>
)
