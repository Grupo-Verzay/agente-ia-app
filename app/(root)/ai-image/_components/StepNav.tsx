import { CheckCircle2 } from 'lucide-react'
import { STUDIO_STEPS } from './ad-generator.constants'
import type { StudioStepId } from './ad-generator.types'

interface StepNavProps {
  activeStep: StudioStepId
  stepCompletion: Record<StudioStepId, boolean>
  onStepClick: (id: StudioStepId) => void
}

export const StepNav = ({ activeStep, stepCompletion, onStepClick }: StepNavProps) => (
  <div className="border-b px-4 py-3">
    <div className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 lg:grid-cols-4">
      {STUDIO_STEPS.map((step, index) => {
        const StepIcon = step.icon
        const isCompleted = stepCompletion[step.id]
        const isActive = activeStep === step.id

        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onStepClick(step.id)}
            className={`h-auto rounded-2xl border px-3 py-3 text-left transition ${
              isActive
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border/70 bg-muted/20 hover:border-primary/40'
            }`}
          >
            <div className="flex w-full items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-background">
                <span className="text-xs font-semibold">{index + 1}</span>
              </div>
              <div className="flex gap-2 h-9 flex-1 items-center">
                <StepIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">{step.label}</span>
                {isCompleted && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  </div>
)
