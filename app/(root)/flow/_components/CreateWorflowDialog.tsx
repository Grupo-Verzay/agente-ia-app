"use client";

import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Layers2Icon, Loader2, SaveIcon, Brain, Workflow, Bot } from 'lucide-react';
import CustomDialogHeader from "@/components/shared/CustomDialogHeader";
import { useForm } from "react-hook-form";
import { createWorkflowSchema, createWorkflowSchemaType } from "@/schema/workflow";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { createWorkflow, CreateWorkflowTriggerPayload } from "@/actions/workflow-actions";

type FlowType = "IA" | "Flujo" | "Chatbot";

const MAX_KEYWORDS = 20;

function CreateWorflowDialog({ triggerText, isPro = false }: { triggerText?: String; isPro: boolean }) {
  const [open, setOpen] = useState(false);
  const [flowType, setFlowType] = useState<FlowType | null>(null);

  // Chatbot
  const [matchType, setMatchType] = useState<"Exacta" | "Contiene">("Exacta");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");

  // IA
  const [triggerCondition, setTriggerCondition] = useState("");

  const form = useForm<createWorkflowSchemaType>({
    resolver: zodResolver(createWorkflowSchema),
    defaultValues: { isPro },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: ({ payload, trigger }: { payload: createWorkflowSchemaType; trigger: CreateWorkflowTriggerPayload | null }) =>
      createWorkflow(payload, trigger),
    onSuccess: () => {
      toast.success("Flujo creado", { id: "create-workflow" });
    },
    onError: () => {
      toast.error("Falló la creación del flujo", { id: "create-workflow" });
    },
  });

  const clearState = () => {
    form.reset();
    setFlowType(null);
    setMatchType("Exacta");
    setKeywords([]);
    setKeywordInput("");
    setTriggerCondition("");
  };

  const handleAddKeyword = () => {
    const raw = keywordInput.trim();
    if (!raw) return;
    if (keywords.length >= MAX_KEYWORDS) return toast.error("Máximo 20 palabras clave");
    if (keywords.some(k => k.toLowerCase() === raw.toLowerCase())) return toast.error("Palabra clave ya agregada");
    const next = [...keywords, raw];
    setKeywords(next);
    setKeywordInput("");
    form.setValue("description", next.join(", "));
  };

  const handleRemoveKeyword = (value: string) => {
    const next = keywords.filter(k => k !== value);
    setKeywords(next);
    form.setValue("description", next.join(", "));
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddKeyword(); }
  };

  const onSubmit = useCallback(
    (values: createWorkflowSchemaType) => {
      if (!flowType) return toast.error("Selecciona un tipo de flujo.");
      let descriptionJson = "";
      let trigger: CreateWorkflowTriggerPayload | null = null;

      if (flowType === "Chatbot") {
        const cleaned = keywords.map(k => k.trim()).filter(Boolean);
        descriptionJson = cleaned.length > 0
          ? JSON.stringify({ matchType: matchType.toLowerCase(), keywords: cleaned.map(k => k.toLowerCase()) })
          : "";
      }

      if (flowType === "IA") {
        if (!triggerCondition.trim()) return toast.error("La descripción de la intención es obligatoria.");
        trigger = {
          name: values.name.trim(),
          mode: "prompt",
          condition: triggerCondition.trim(),
        };
      }

      const payload: createWorkflowSchemaType = { ...values, isPro, description: descriptionJson };
      toast.loading("Creando flujo...", { id: "create-workflow" });
      mutate({ payload, trigger });
    },
    [mutate, flowType, matchType, keywords, isPro, triggerCondition]
  );

  const typeOptions: { value: FlowType; label: string; subtitle: string; icon: React.ElementType; bg: string; border: string; text: string; iconColor: string; subtitleColor: string }[] = [
    {
      value: "IA",
      label: "IA",
      subtitle: "Detecta intenciones",
      icon: Brain,
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-800 hover:border-blue-400",
      text: "text-blue-700 dark:text-blue-300",
      iconColor: "text-blue-500",
      subtitleColor: "text-blue-400 dark:text-blue-500",
    },
    {
      value: "Flujo",
      label: "Flujo",
      subtitle: "Manual o encadenado",
      icon: Workflow,
      bg: "bg-violet-50 dark:bg-violet-950/30",
      border: "border-violet-200 dark:border-violet-800 hover:border-violet-400",
      text: "text-violet-700 dark:text-violet-300",
      iconColor: "text-violet-500",
      subtitleColor: "text-violet-400 dark:text-violet-500",
    },
    {
      value: "Chatbot",
      label: "Chatbot",
      subtitle: "Por palabras clave",
      icon: Bot,
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-800 hover:border-emerald-400",
      text: "text-emerald-700 dark:text-emerald-300",
      iconColor: "text-emerald-500",
      subtitleColor: "text-emerald-400 dark:text-emerald-500",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { clearState(); setOpen(nextOpen); }}>
      <DialogTrigger asChild>
        <Button>{triggerText ?? "CREAR FLUJO"}</Button>
      </DialogTrigger>
      <DialogContent className="px-0">
        <CustomDialogHeader icon={Layers2Icon} title="CREAR FLUJO" />
        <div className="px-6 pt-6 pb-0">
          <Form {...form}>
            <form className="space-y-3 w-full" onSubmit={form.handleSubmit(onSubmit)}>

              {/* 1. NOMBRE */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex gap-1 items-center font-bold text-base">
                      Nombre <p className="text-xs text-primary font-normal">(obligatorio)</p>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nombre del flujo" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 2. TIPO: IA | Flujo | Chatbot */}
              <div className="space-y-4">
                <FormLabel className="font-bold text-base">Tipo</FormLabel>

                {!flowType && (
                  <p className="text-sm text-foreground/70">Define cómo se activa el flujo:</p>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {!flowType ? (
                    typeOptions.map(opt => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setFlowType(opt.value)}
                          className={`h-[72px] flex flex-col items-center justify-center gap-1 rounded-lg border px-2 transition-colors ${opt.bg} ${opt.border}`}
                        >
                          <div className="flex flex-row items-center gap-1.5">
                            <Icon className={`h-4 w-4 shrink-0 ${opt.iconColor}`} />
                            <p className={`text-sm font-semibold leading-none ${opt.text}`}>{opt.label}</p>
                          </div>
                          <p className={`text-[10px] leading-none ${opt.subtitleColor}`}>{opt.subtitle}</p>
                        </button>
                      );
                    })
                  ) : (() => {
                    const selected = typeOptions.find(o => o.value === flowType)!;
                    const Icon = selected.icon;
                    return (
                      <button
                        key={selected.value}
                        type="button"
                        onClick={() => setFlowType(null)}
                        className="col-span-3 h-10 px-4 flex items-center gap-2 rounded-lg border border-primary bg-primary/5 text-primary transition-colors"
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <p className="text-sm font-semibold">{selected.label}</p>
                        <span className="ml-auto text-sm text-primary/60">Cambiar</span>
                      </button>
                    );
                  })()}
                </div>
              </div>

              {/* SECCIÓN CONDICIONAL SEGÚN TIPO */}

              {/* FLUJO: descripción breve */}
              {flowType === "Flujo" && (
                <p className="text-sm text-foreground/70">Se activa cuando el agente IA lo llama por su nombre desde<br />algún paso, o manualmente mediante una respuesta rápida.</p>
              )}

              {/* IA: descripción de intención (Prompt IA siempre) */}
              {flowType === "IA" && (
                <div className="space-y-1.5">
                  <FormLabel className="font-semibold text-sm">Descripción de la intención <span className="text-xs text-primary font-normal">(obligatorio)</span></FormLabel>
                  <Textarea
                    value={triggerCondition}
                    onChange={e => setTriggerCondition(e.target.value)}
                    placeholder="El usuario quiere comprar o pregunta por precios o disponibilidad"
                    rows={3}
                    className="resize-none text-sm"
                  />
                </div>
              )}

              {/* CHATBOT: matchType + keywords */}
              {flowType === "Chatbot" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <FormLabel className="font-semibold text-sm">Tipo de coincidencia</FormLabel>
                    <select
                      value={matchType}
                      onChange={e => setMatchType(e.target.value as "Exacta" | "Contiene")}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="Exacta">Exacta</option>
                      <option value="Contiene">Contiene</option>
                    </select>
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex gap-1 items-center font-semibold text-sm">
                          Palabras clave <p className="text-xs text-primary font-normal">(opcional, hasta 20)</p>
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Input
                                value={keywordInput}
                                onChange={e => setKeywordInput(e.target.value)}
                                onKeyDown={handleKeywordKeyDown}
                                placeholder="Escribe una palabra o frase y presiona Enter"
                              />
                              <Button
                                type="button"
                                onClick={handleAddKeyword}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 h-10 shrink-0"
                              >
                                <SaveIcon className="h-4 w-4" />
                              </Button>
                            </div>
                            <input type="hidden" {...field} value={keywords.join(", ")} readOnly />
                            <div className="flex flex-wrap gap-2">
                              {keywords.map(kw => (
                                <span key={kw} className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                  {kw}
                                  <button type="button" onClick={() => handleRemoveKeyword(kw)} className="ml-1 opacity-70 hover:opacity-100">✕</button>
                                </span>
                              ))}
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* 3. CREAR */}
              <Button type="submit" className="w-full !mt-5" disabled={isPending}>
                {isPending ? <Loader2 className="animate-spin" /> : "Crear"}
              </Button>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CreateWorflowDialog;
