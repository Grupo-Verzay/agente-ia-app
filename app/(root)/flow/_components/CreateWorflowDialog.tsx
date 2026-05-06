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

  const typeOptions: { value: FlowType; label: string; icon: React.ElementType; detail: string }[] = [
    {
      value: "IA",
      label: "IA",
      icon: Brain,
      detail: "El agente detecta automáticamente la intención del cliente y lanza este flujo. Ideal para: enviar catálogos, cotizaciones o activar procesos cuando el usuario muestra interés.",
    },
    {
      value: "Flujo",
      label: "Flujo",
      icon: Workflow,
      detail: "Se ejecuta manualmente o desde otro flujo. Úsalo para secuencias de seguimiento, mensajes programados o flujos que el agente llama por nombre.",
    },
    {
      value: "Chatbot",
      label: "Chatbot",
      icon: Bot,
      detail: "Se activa cuando el cliente escribe una palabra o frase específica (ej: 'precio', 'agendar'). El agente NO interviene; responde el flujo directamente.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { clearState(); setOpen(nextOpen); }}>
      <DialogTrigger asChild>
        <Button>{triggerText ?? "CREAR FLUJO"}</Button>
      </DialogTrigger>
      <DialogContent className="px-0">
        <CustomDialogHeader icon={Layers2Icon} title="CREAR FLUJO" />
        <div className="p-6">
          <Form {...form}>
            <form className="space-y-6 w-full" onSubmit={form.handleSubmit(onSubmit)}>

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
              <div className="space-y-2">
                <FormLabel className="font-bold text-base">Tipo</FormLabel>

                {!flowType ? (
                  /* Sin selección: descripción + 3 botones */
                  <>
                    <p className="text-sm text-foreground/70">
                      Define cómo se activa el flujo: por intención detectada por IA, condicionado desde el entrenamiento del agente, o por palabras clave exactas como disparadores.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {typeOptions.map(opt => {
                        const Icon = opt.icon;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setFlowType(opt.value)}
                            className="rounded-lg border border-border px-3 py-3 hover:border-muted-foreground/50 transition-colors"
                          >
                            <div className="flex flex-col items-center gap-1.5">
                              <Icon className="h-5 w-5" />
                              <p className="text-sm font-semibold">{opt.label}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  /* Con selección: solo el botón elegido + "Cambiar" */
                  (() => {
                    const selected = typeOptions.find(o => o.value === flowType)!;
                    const Icon = selected.icon;
                    return (
                      <div className="flex items-center justify-between rounded-lg border border-primary bg-primary/5 px-4 py-3">
                        <div className="flex items-center gap-3 text-primary">
                          <Icon className="h-5 w-5" />
                          <p className="text-sm font-semibold">{selected.label}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFlowType(null)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cambiar tipo
                        </button>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* SECCIÓN CONDICIONAL SEGÚN TIPO */}

              {/* IA: descripción de intención (Prompt IA siempre) */}
              {flowType === "IA" && (
                <div className="space-y-1.5">
                  <FormLabel>Descripción de la intención <span className="text-xs text-primary">(obligatorio)</span></FormLabel>
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
                    <FormLabel>Tipo de coincidencia</FormLabel>
                    <select
                      value={matchType}
                      onChange={e => setMatchType(e.target.value as "Exacta" | "Contiene")}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="Exacta">Exacta</option>
                      <option value="Contiene">Contiene</option>
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      Define si la palabra clave debe coincidir exactamente o basta con que esté contenida en el mensaje.
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex gap-1 items-center">
                          Palabras clave <p className="text-xs text-muted-foreground">(opcional, hasta 20)</p>
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
                            <div className="flex flex-wrap gap-2 min-h-[24px]">
                              {keywords.map(kw => (
                                <span key={kw} className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                  {kw}
                                  <button type="button" onClick={() => handleRemoveKeyword(kw)} className="ml-1 opacity-70 hover:opacity-100">✕</button>
                                </span>
                              ))}
                              {keywords.length === 0 && (
                                <p className="text-xs text-muted-foreground italic">&apos;precio&apos;, &apos;cotización&apos;, &apos;tengo una duda&apos;...</p>
                              )}
                            </div>
                          </div>
                        </FormControl>
                        <FormDescription className="text-xs">Estas palabras activarán el flujo. Máx. 20.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* 3. CREAR */}
              <Button type="submit" className="w-full" disabled={isPending}>
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
