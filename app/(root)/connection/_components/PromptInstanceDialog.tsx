'use client';

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

// Asumo que estas importaciones son correctas en tu proyecto
import { PromptInstance } from "@prisma/client";
import { PromptInstanciaFormValues, PromptInstanciaSchema } from "@/schema/ai";
import { createPromptInstancia, updatePromptInstancia } from "@/actions/prompt-actions";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";

type PlatformConfig = {
  tabs: Record<string, string>;    // key: tabKey, value: label
  content: Record<string, string>;  // default content per tabKey
  defaultTab: string;
};

const PLATFORM_CONFIG: Record<string, PlatformConfig> = {
  Instagram: {
    tabs: { comentarios: "Agente Comentarios", mensajes: "Agente Mensajes" },
    content: {
      comentarios: "Eres un agente de Instagram dedicado a responder comentarios.",
      mensajes: "Eres un agente de Instagram especializado en responder mensajes privados.",
    },
    defaultTab: "comentarios",
  },
  Facebook: {
    tabs: { comentarios: "Agente Publicaciones", mensajes: "Agente Mensajes" },
    content: {
      comentarios: "Eres un agente de Facebook dedicado a interactuar en publicaciones.",
      mensajes: "Eres un agente de Facebook especializado en responder por mensajes.",
    },
    defaultTab: "comentarios",
  },
  Whatsapp: {
    tabs: { mensajes: "Agente de mensajes" },
    content: {
      mensajes: "Eres un asistente virtual de WhatsApp configurado para responder preguntas y asistir a los usuarios de manera eficiente.",
    },
    defaultTab: "mensajes",
  },
};

interface PromptDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  prompts: PromptInstance[] | undefined;
  userId: string;
  platform: string; // permitimos string por robustez en runtime
}

export const PromptInstanceDialog = ({
  open,
  setOpen,
  prompts,
  userId,
  platform,
}: PromptDialogProps) => {
  const router = useRouter();

  // Estado UI
  const [activeTab, setActiveTab] = useState<string>("");
  const [allPrompts, setAllPrompts] = useState<Record<string, PromptInstanciaFormValues>>({});
  // 💡 CORRECCIÓN: Estado para controlar si el formulario ya ha sido inicializado al abrir el diálogo
  const [isInitialized, setIsInitialized] = useState(false);

  // Form
  const form = useForm<PromptInstanciaFormValues>({
    resolver: zodResolver(PromptInstanciaSchema),
  });
  const { handleSubmit, getValues, setValue } = form;

  // Config de plataforma (no condicionar hooks al valor de config)
  const config: PlatformConfig | undefined = useMemo(
    () => PLATFORM_CONFIG[platform],
    [platform]
  );

  const mutation = useMutation({
    mutationFn: async (data: PromptInstanciaFormValues) => {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          // Asegura que 'content' sea una cadena, si es necesario
          formData.append(key, String(value));
        }
      });
      return data.id
        ? updatePromptInstancia(data.id, formData)
        : createPromptInstancia(formData);
    },
    onError: () => toast.error("Ocurrió un error al guardar el prompt."),
  });

  // 💡 CORRECCIÓN: Lógica de inicialización separada de la actualización en tiempo real.
  useEffect(() => {
    // Si el diálogo se cierra, resetea el estado de inicialización
    if (!open || !config) {
      setIsInitialized(false);
      return;
    }

    // Si ya está inicializado (y el diálogo está abierto), no hagas nada más.
    if (isInitialized) return;

    // --- Lógica de Inicialización ---

    // 1. Construir mapa inicial por pestaña con defaults + existentes
    const initialData: Record<string, PromptInstanciaFormValues> = {};
    Object.keys(config.tabs).forEach((tabKey) => {
      const existingPrompt = prompts?.find((p) => p.description === tabKey);
      initialData[tabKey] = {
        id: existingPrompt?.id,
        userId,
        instanceType: platform,
        description: tabKey,
        content: existingPrompt?.content ?? config.content[tabKey] ?? "",
      };
    });

    setAllPrompts(initialData);

    // 2. Determinar pestaña activa y cargar el formulario
    // Usamos config.defaultTab para la primera carga, ya que activeTab es "" inicialmente
    const effectiveTab = config.defaultTab;
    setActiveTab(effectiveTab);

    const first = initialData[effectiveTab];

    // Cargar valores iniciales en el formulario.
    // { shouldDirty: false } evita que el formulario se marque como modificado al cargar.
    setValue("id", first.id, { shouldDirty: false });
    setValue("userId", first.userId, { shouldDirty: false });
    setValue("instanceType", first.instanceType, { shouldDirty: false });
    setValue("description", first.description, { shouldDirty: false });
    setValue("content", first.content || "", { shouldDirty: false });

    // Marcar como inicializado para evitar futuras ejecuciones de este bloque mientras `open` es true
    setIsInitialized(true);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config, prompts, userId, platform, setValue]);

  // Cambio de pestaña: guardar la actual y cargar la nueva en el form
  const handleTabChange = useCallback((newTab: string) => {
    // 1. Guardar el estado actual del formulario en la pestaña anterior
    setAllPrompts((prev) => {
      const currentValues = getValues();
      const updated = { ...prev, [activeTab]: currentValues };

      // 2. Cargar el content de la nueva pestaña
      const selected = updated[newTab];
      if (selected) {
        // Cargar los valores en el formulario. Esto actualiza el `textarea`.
        setValue("id", selected.id);
        setValue("userId", selected.userId);
        setValue("instanceType", selected.instanceType);
        setValue("description", selected.description);
        setValue("content", selected.content || "");
      }
      return updated;
    });
    // 3. Cambiar la pestaña activa
    setActiveTab(newTab);
  }, [activeTab, getValues, setValue]);

  // Submit: guarda todas las pestañas (incluye la activa con los últimos cambios)
  const onSubmit = useCallback(async () => {
    try {
      // Captura los valores finales del formulario para la pestaña activa
      const currentValues = getValues();
      // Combina los prompts no activos con los últimos cambios de la pestaña activa
      const updatedPrompts = { ...allPrompts, [activeTab]: currentValues };

      const results = await Promise.all(
        Object.values(updatedPrompts).map((p) => mutation.mutateAsync(p))
      );

      if (results.every((r) => r.success)) {
        toast.success("Todos los prompts se guardaron correctamente.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error("Ocurrió un error al guardar uno o más prompts.");
      }
    } catch (err) {
      console.error("Error al guardar todos los prompts:", err);
      toast.error("Error inesperado al guardar.");
    }
  }, [allPrompts, activeTab, getValues, mutation, router, setOpen]);

  // Layout de tabs
  const tabCount = config ? Object.keys(config.tabs).length : 0;
  const gridColsClass = tabCount === 1 ? "grid-cols-1" : tabCount === 2 ? "grid-cols-2" : "grid-cols-3";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl w-[95vw] h-[85vh] p-6 flex flex-col justify-between border-border overflow-y-auto transition-all duration-300">
        {!config ? (
          <div className="text-sm text-muted-foreground">
            Plataforma no reconocida: <span className="font-medium">{platform}</span>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-grow">
              <DialogHeader>
                <DialogTitle className="text-center text-xl font-bold">
                  {prompts?.length ? "Editar Prompts" : "Crear Prompts"}
                </DialogTitle>
                <DialogDescription className="text-center text-base">
                  {prompts?.length
                    ? "Modifica el content del prompt para tu agente."
                    : "Crea un nuevo prompt para tu agente de IA."}
                </DialogDescription>
              </DialogHeader>

              <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
                {/* Solo renderizar TabsList si config está definido y hay pestañas */}
                {config && Object.keys(config.tabs).length > 0 && (
                  <TabsList className={`w-full grid ${gridColsClass}`}>
                    {Object.entries(config.tabs).map(([key, label]) => (
                      <TabsTrigger key={key} value={key}>
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                )}

                <div className="mt-4 flex-1">
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem className="h-full">
                        <FormControl>
                          <Textarea
                            placeholder="Escribe el mensaje del agente..."
                            className="flex-1 resize-none overflow-y-auto min-h-[300px] h-full rounded-lg"
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </Tabs>

              <DialogFooter className="mt-4">
                <Button type="submit" disabled={mutation.isPending} className="text-lg px-6 py-3">
                  {mutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
};