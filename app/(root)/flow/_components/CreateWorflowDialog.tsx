"use client";

import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Layers2Icon, Loader2, SaveIcon } from 'lucide-react';
import CustomDialogHeader from "@/components/shared/CustomDialogHeader";
import { useForm } from "react-hook-form";
import {
  createWorkflowSchema,
  createWorkflowSchemaType,
} from "@/schema/workflow";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { createWorkflow } from "@/actions/workflow-actions";

const MAX_KEYWORDS = 20;

function CreateWorflowDialog({ triggerText, isPro = false }: { triggerText?: String, isPro: boolean }) {
  const [open, setOpen] = useState(false);

  // Select "fantasma" para el tipo de coincidencia
  const [matchType, setMatchType] = useState<"Exacta" | "Contiene">("Exacta");

  // Estado local para palabras clave (chips)
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");

  const form = useForm<createWorkflowSchemaType>({
    resolver: zodResolver(createWorkflowSchema),
    defaultValues: { isPro },
  });

  // Configuración de la mutación
  const { mutate, isPending } = useMutation({
    mutationFn: createWorkflow,
    onSuccess: () => {
      toast.success("Flujo creado", { id: "create-workflow" });
    },
    onError: () => {
      toast.error("Falló la creación del flujo", { id: "create-workflow" });
    },
  });

  const clearState = () => {
    form.reset();
    setMatchType("Exacta");
    setKeywords([]);
    setKeywordInput("");
  };

  const handleAddKeyword = () => {
    const raw = keywordInput.trim();
    if (!raw) return;

    if (keywords.length >= MAX_KEYWORDS) {
      toast.error("Solo puedes agregar hasta 20 palabras clave por flujo");
      return;
    }

    const exists = keywords.some(
      (k) => k.toLowerCase() === raw.toLowerCase()
    );
    if (exists) {
      toast.error("Esta palabra clave ya fue agregada");
      return;
    }

    const next = [...keywords, raw];
    setKeywords(next);
    setKeywordInput("");
    // Opcional: mantenemos description sincronizado con las tags (no se usa directamente)
    form.setValue("description", next.join(", "));
  };

  const handleRemoveKeyword = (value: string) => {
    const next = keywords.filter((k) => k !== value);
    setKeywords(next);
    form.setValue("description", next.join(", "));
  };

  const handleKeywordKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const onSubmit = useCallback(
    (values: createWorkflowSchemaType) => {
      const cleanedKeywords = keywords
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      const descriptionJson =
        cleanedKeywords.length > 0
          ? JSON.stringify({
            matchType: matchType.toLocaleLowerCase(),
            keywords: cleanedKeywords.map((k) => k.toLocaleLowerCase()),
          })
          : "";

      const payload: createWorkflowSchemaType = {
        ...values,
        isPro,
        description: descriptionJson,
      };

      toast.loading("Creando flujo...", { id: "create-workflow" });
      mutate(payload);
    },
    [mutate, matchType, keywords, isPro]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        clearState();
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button>{triggerText ?? "CREAR FLUJO"}</Button>
      </DialogTrigger>
      <DialogContent className="px-0">
        <CustomDialogHeader icon={Layers2Icon} title="CREAR FLUJO" />
        <div className="p-6">
          <Form {...form}>
            <form
              className="space-y-8 w-full"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex gap-1 items-center">
                      Nombre
                      <p className="text-xs text-primary">(obligatorio)</p>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      Escribe un nombre único para el flujo.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* SELECT FANTASMA: Exacta / Contiene */}
              <div className="space-y-1">
                <FormLabel className="flex gap-1 items-center">
                  Tipo de coincidencia
                  <p className="text-xs text-muted-foreground">
                    (solo para la lógica interna)
                  </p>
                </FormLabel>
                <select
                  value={matchType}
                  onChange={(e) =>
                    setMatchType(e.target.value as "Exacta" | "Contiene")
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="Exacta">Exacta</option>
                  <option value="Contiene">Contiene</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Define si la palabra clave debe coincidir de forma exacta o si
                  basta con que esté contenida en el mensaje.
                </p>
              </div>

              {/* PALABRAS CLAVE = INPUT + CHIPS */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex gap-1 items-center">
                      Palabras clave
                      <p className="text-xs text-muted-foreground">
                        (opcional, hasta 20)
                      </p>
                    </FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <div className="flex flex-row gap-2 justify-center items-center">
                          <Input
                            value={keywordInput}
                            onChange={(e) =>
                              setKeywordInput(e.target.value)
                            }
                            onKeyDown={handleKeywordKeyDown}
                            placeholder="Escribe una palabra o frase y presiona Enter"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleAddKeyword}
                            aria-label="Guardar"
                            className="
            gap-0 sm:gap-2 px-2 sm:px-3 h-9
            bg-emerald-600 text-white
            hover:bg-emerald-700
            focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2
            disabled:bg-emerald-600/60 disabled:text-white/80
          "
                          >
                            <SaveIcon />
                          </Button>
                        </div>

                        {/* mantenemos el field sincronizado pero oculto */}
                        <input
                          type="hidden"
                          {...field}
                          value={keywords.join(", ")}
                          readOnly
                        />

                        <div className="flex flex-wrap gap-2">
                          {keywords.map((kw) => (
                            <span
                              key={kw}
                              className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                            >
                              {kw}
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveKeyword(kw)
                                }
                                className="ml-1 text-xs opacity-70 hover:opacity-100"
                                aria-label={`Eliminar ${kw}`}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                          {keywords.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              Puedes agregar varias palabras o frases como:
                              &nbsp;
                              <span className="italic">
                                {`${"'precio', 'cotización', 'tengo una duda', 'etc.'"}`}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs" >
                      Estas palabras activarán el flujo según el tipo de
                      coincidencia seleccionado. Máx. 20.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isPending}>
                {!isPending && "Iniciar"}
                {isPending && <Loader2 className="animate-spin" />}
              </Button>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CreateWorflowDialog;