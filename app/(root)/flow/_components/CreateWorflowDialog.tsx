"use client";

import { BotonDeCrear } from "@/components/shared/BarraDeAcciones";
import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Layers2Icon, Loader2 } from 'lucide-react';
import CustomDialogHeader from "@/components/shared/CustomDialogHeader";
import { useForm } from "react-hook-form";
import { createWorkflowSchema, createWorkflowSchemaType } from "@/schema/workflow";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { createWorkflow, CreateWorkflowTriggerPayload } from "@/actions/workflow-actions";
import {
  ACTIVACION_VACIA,
  SelectorDeTipoDeActivacion,
  type ActivacionEnElSelector,
} from "@/components/flujos/SelectorDeTipoDeActivacion";
import { laDescripcionDelChatbot } from "@/lib/tipo-de-activacion";

function CreateWorflowDialog({ triggerText, isPro = false }: { triggerText?: String; isPro: boolean }) {
  const [open, setOpen] = useState(false);
  // El tipo y sus campos: el MISMO selector que «Cambiar tipo» de un flujo creado.
  const [activacion, setActivacion] = useState<ActivacionEnElSelector>(ACTIVACION_VACIA);
  const flowType = activacion.tipo;

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
    setActivacion(ACTIVACION_VACIA);
  };

  const cambiarActivacion = (siguiente: ActivacionEnElSelector) => {
    if (siguiente.tipo === "inicio" && activacion.tipo !== "inicio") form.setValue("name", "BIENVENIDA");
    if (activacion.tipo === "inicio" && siguiente.tipo !== "inicio") form.setValue("name", "");
    setActivacion(siguiente);
  };

  const onSubmit = useCallback(
    (values: createWorkflowSchemaType) => {
      if (!flowType) return toast.error("Selecciona un tipo de flujo.");
      let descriptionJson = "";
      let trigger: CreateWorkflowTriggerPayload | null = null;

      if (flowType === "chatbot") {
        descriptionJson = laDescripcionDelChatbot(activacion.palabras, activacion.coincidencia);
      }

      if (flowType === "ia") {
        if (!activacion.condicion.trim()) return toast.error("La descripción de la intención es obligatoria.");
        trigger = {
          name: values.name.trim(),
          mode: "prompt",
          condition: activacion.condicion.trim(),
        };
      }

      const isBienvenida = flowType === "inicio";
      const payload: createWorkflowSchemaType = { ...values, isPro, description: descriptionJson, triggerOnNewSession: isBienvenida };
      toast.loading("Creando flujo...", { id: "create-workflow" });
      mutate({ payload, trigger });
    },
    [mutate, flowType, activacion, isPro]
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { clearState(); setOpen(nextOpen); }}>
      <DialogTrigger asChild>
        {/* En la barra es el «Nuevo» de todas las listas; en la lista vacía,
            un botón con su frase. */}
        {triggerText === "Nuevo" ? <BotonDeCrear>Nuevo</BotonDeCrear> : <Button>{triggerText ?? "Crear flujo"}</Button>}
      </DialogTrigger>
      <DialogContent className="px-0">
        <CustomDialogHeader icon={Layers2Icon} title="NUEVO FLUJO" />
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
                      <Input
                        {...field}
                        placeholder="NOMBRE DEL FLUJO"
                        disabled={flowType === "inicio"}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 2. TIPO: el selector compartido con «Cambiar tipo» */}
              <SelectorDeTipoDeActivacion value={activacion} onChange={cambiarActivacion} />

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
