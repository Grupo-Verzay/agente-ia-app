import { CheckCircle2 } from 'lucide-react'
import { STUDIO_STEPS } from './ad-generator.constants'
import type { StudioStepId } from './ad-generator.types'

interface StepNavProps {
  activeStep: StudioStepId
  stepCompletion: Record<StudioStepId, boolean>
  onStepClick: (id: StudioStepId) => void
}

export const StepNav = ({ activeStep, stepCompletion, onStepClick }: StepNavProps) => (
  <div className="border-b px-4 py-2">
    <div className="grid w-full grid-cols-4 gap-1.5">
      {STUDIO_STEPS.map((step, index) => {
        const StepIcon = step.icon
        const isCompleted = stepCompletion[step.id]
        const isActive = activeStep === step.id

        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onStepClick(step.id)}
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 transition ${
              isActive
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border/60 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            <span className={`text-[11px] font-bold ${isActive ? 'text-primary' : 'text-muted-foreground/60'}`}>
              {index + 1}
            </span>
            <StepIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-xs font-semibold">{step.label}</span>
            {isCompleted && <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
          </button>
        )
      })}
    </div>
  </div>
)
