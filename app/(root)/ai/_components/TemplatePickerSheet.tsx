"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Layers, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AGENT_TEMPLATES } from "./helpers/agentTemplates";
import { applyTemplateToPrompt } from "@/actions/apply-template-action";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promptId: string;
  hasContent?: boolean;
  onApplied: () => void;
}

export function TemplatePickerSheet({ open, onOpenChange, promptId, hasContent, onApplied }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleApply = () => {
    if (!selected) return;
    if (hasContent && !confirmed) { setConfirmed(true); return; }

    startTransition(async () => {
      const res = await applyTemplateToPrompt({ promptId, templateId: selected });
      if (res.ok) {
        toast.success("Plantilla aplicada correctamente");
        onApplied();
        onOpenChange(false);
        setSelected(null);
        setConfirmed(false);
      } else {
        toast.error(res.error ?? "No se pudo aplicar la plantilla");
      }
    });
  };

  const template = AGENT_TEMPLATES.find((t) => t.id === selected);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { setSelected(null); setConfirmed(false); } onOpenChange(v); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" />
            Plantillas por rubro
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Elige una plantilla para pre-configurar las secciones del agente. Puedes editar todo después.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            {AGENT_TEMPLATES.map((t) => {
              const isSelected = selected === t.id;
              const faqCount = t.sections.faq?.length ?? 0;
              const trainingCount = t.sections.training?.length ?? 0;
              const managementCount = t.sections.management?.length ?? 0;
              const total = faqCount + trainingCount + managementCount;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setSelected(t.id); setConfirmed(false); }}
                  className={cn(
                    "relative rounded-lg border p-3 text-left transition-all hover:shadow-sm",
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  {isSelected && (
                    <CheckCircle2 className="absolute right-2 top-2 h-4 w-4 text-primary" />
                  )}
                  <span className="text-2xl">{t.emoji}</span>
                  <p className="mt-1.5 text-sm font-semibold leading-tight">{t.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug line-clamp-2">{t.description}</p>
                  <p className="mt-1.5 text-[10px] text-muted-foreground/70">{total} instrucciones</p>
                </button>
              );
            })}
          </div>

          {selected && template && (
            <div className="mt-4 rounded-lg border bg-muted/30 p-3 space-y-2 text-xs">
              <p className="font-semibold text-foreground">Incluye en {template.name}:</p>
              {template.sections.training && (
                <div>
                  <span className="font-medium text-foreground/80">👋 Inicio:</span>{" "}
                  <span className="text-muted-foreground">{template.sections.training.map((s) => s.title).join(", ")}</span>
                </div>
              )}
              {template.sections.faq && (
                <div>
                  <span className="font-medium text-foreground/80">❓ Preguntas:</span>{" "}
                  <span className="text-muted-foreground">{template.sections.faq.map((s) => s.title).join(" · ")}</span>
                </div>
              )}
              {template.sections.management && (
                <div>
                  <span className="font-medium text-foreground/80">📦 Gestión:</span>{" "}
                  <span className="text-muted-foreground">{template.sections.management.map((s) => s.title).join(", ")}</span>
                </div>
              )}
              <p className="text-muted-foreground/60 pt-0.5">Los productos y datos del negocio no se modifican.</p>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t px-4 py-3 space-y-2">
          {confirmed && hasContent && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Esto reemplazará Inicio, Preguntas y Gestión con el contenido de la plantilla. ¿Confirmas?
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={!selected || isPending}
              onClick={handleApply}
            >
              {isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Aplicando...</>
              ) : confirmed && hasContent ? (
                "Sí, reemplazar"
              ) : (
                "Aplicar plantilla"
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
