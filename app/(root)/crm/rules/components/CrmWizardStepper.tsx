"use client";

import { Check } from "lucide-react";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type CrmWizardStep = {
  id: string;
  title: string;
  description: string;
};

export function CrmWizardStepper({
  steps,
  currentStep,
  onStepChange,
}: {
  steps: CrmWizardStep[];
  currentStep: string;
  onStepChange: (stepId: string) => void;
}) {
  if (steps.length === 0) return null;

  const currentIndex = Math.max(
    steps.findIndex((step) => step.id === currentStep),
    0
  );

  return (
    <Tabs value={currentStep} onValueChange={onStepChange} className="w-full">
      <ScrollArea>
        <TabsList className="h-auto gap-1.5 rounded-none bg-transparent px-0 py-0.5">
          {steps.map((step, index) => {
            const isCompleted = index < currentIndex;

            return (
              <TabsTrigger
                key={step.id}
                value={step.id}
                title={step.description}
                className={cn(
                  "h-8 gap-2 rounded-full px-3 text-sm font-medium transition-colors",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none transition-colors",
                    isCompleted
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                    "in-data-[state=active]:bg-white/20 in-data-[state=active]:text-primary-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                {step.title}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </Tabs>
  );
}
