"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Copy, FileText, Lightbulb, Loader2, RefreshCw,
  SendHorizontal, Sparkles, Trash2, Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { sendAgentPromptChatAction } from "@/actions/ai-prompt-chat-actions";
import { autoSaveBeforeGenerate, generateFlowSections, applyAllGeneratedSections } from "@/actions/generate-agent-flow";
import type { ChatMessage } from "@/types/ai-assistence-chat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TYPE_AI_LABELS, type AiSectionKey } from "./ai-section-labels";

type GenStage = "idle" | "running" | "done" | "error";
type QuickPrompt = { label: string; icon: React.ElementType; text: string };

type AgentPromptChatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: AiSectionKey;
  currentDraft: string;
  promptPreview: string;
  promptId?: string;
  onApplyDraft?: (text: string) => void;
};

const QUICK_PROMPTS: Record<AiSectionKey, QuickPrompt[]> = {
  business: [
    { label: "Mejorar descripción", icon: Wand2, text: "Mejora la descripción del negocio para que sea más clara y atractiva para clientes por WhatsApp." },
    { label: "Datos clave faltantes", icon: Lightbulb, text: "Sugiere qué datos del negocio faltan o deberían añadirse para que el Agente IA responda mejor." },
    { label: "Tono profesional", icon: Sparkles, text: "Ajusta el tono de la información del negocio para sonar más profesional y confiable." },
  ],
  training: [
    { label: "Mejorar bienvenida", icon: Wand2, text: "Mejora el mensaje de inicio para que sea más cálido, claro y guíe bien al usuario desde el primer mensaje." },
    { label: "Crear saludo ideal", icon: Lightbulb, text: "Crea un saludo inicial con presentación del negocio, oferta principal y pregunta para conocer la necesidad del cliente." },
    { label: "Optimizar inicio", icon: Sparkles, text: "Revisa esta configuración de inicio y dime qué mejorar para que el Agente IA capte mejor la atención desde el primer mensaje." },
  ],
  faq: [
    { label: "Mejorar respuestas", icon: Wand2, text: "Mejora las respuestas de las preguntas frecuentes para que sean más cortas, claras y útiles por WhatsApp." },
    { label: "Crear fórmula FAQ", icon: Lightbulb, text: "Crea una fórmula conversacional para esta sección con objetivo, condición, respuesta, excepción y siguiente paso." },
    { label: "Qué agregar o quitar", icon: Sparkles, text: "Revisa si las preguntas y respuestas cubren bien las dudas más comunes y dime qué agregar o quitar." },
  ],
  products: [
    { label: "Mejorar productos", icon: Wand2, text: "Mejora la descripción de los productos o servicios para que sean más convincentes y fáciles de entender por WhatsApp." },
    { label: "Pitch de ventas", icon: Lightbulb, text: "Crea un pitch conversacional para los productos principales que ayude a cerrar ventas de forma natural." },
    { label: "Optimizar catálogo", icon: Sparkles, text: "Revisa la configuración de productos y dime qué mejorar para que el Agente IA venda mejor sin ser invasivo." },
  ],
  more: [
    { label: "Mejorar extras", icon: Wand2, text: "Mejora la información adicional para que sea más útil y clara para el cliente." },
    { label: "Agregar políticas", icon: Lightbulb, text: "Sugiere qué políticas o términos deberían incluirse aquí para manejar mejor las expectativas del cliente." },
    { label: "Qué falta o sobra", icon: Sparkles, text: "Revisa esta sección y dime qué información adicional falta o sobra para mejorar la experiencia del usuario." },
  ],
  management: [
    { label: "Mejorar gestión", icon: Wand2, text: "Mejora el texto de gestión para que el Agente IA maneje mejor las quejas, seguimientos o escalaciones." },
    { label: "Flujo de escalación", icon: Lightbulb, text: "Crea un flujo claro para escalar casos complejos a un agente humano sin frustrar al cliente." },
    { label: "Optimizar respuestas", icon: Sparkles, text: "Revisa la configuración de gestión y dime cómo mejorar las respuestas para situaciones difíciles." },
  ],
};

// ── Markdown renderer ──────────────────────────────────────────────────────

function inlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
          return <em key={i}>{part.slice(1, -1)}</em>;
        if (part.startsWith("`") && part.endsWith("`"))
          return <code key={i} className="rounded bg-black/10 px-1 font-mono text-[11px]">{part.slice(1, -1)}</code>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    if (/^#{1,3} /.test(line)) {
      const content = line.replace(/^#{1,3} /, "");
      nodes.push(<p key={i} className="mt-2 mb-0.5 font-semibold first:mt-0">{inlineMarkdown(content)}</p>);
    } else if (/^[-*] /.test(line)) {
      nodes.push(
        <div key={i} className="flex gap-1.5">
          <span className="mt-0.5 shrink-0 select-none">•</span>
          <span>{inlineMarkdown(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\. /.test(line)) {
      const match = line.match(/^(\d+)\. (.*)$/);
      if (match) {
        nodes.push(
          <div key={i} className="flex gap-1.5">
            <span className="shrink-0 tabular-nums">{match[1]}.</span>
            <span>{inlineMarkdown(match[2])}</span>
          </div>
        );
      }
    } else if (line.trim() === "") {
      nodes.push(<div key={i} className="h-1" />);
    } else {
      nodes.push(<p key={i}>{inlineMarkdown(line)}</p>);
    }
  });

  return <div className="space-y-0.5">{nodes}</div>;
}

// ── Chat bubble ────────────────────────────────────────────────────────────

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: Date.now() };
}

function PromptChatBubble({
  message,
  onApply,
}: {
  message: ChatMessage;
  onApply?: (text: string) => void;
}) {
  const isUser = message.role === "user";

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Copiado.");
    } catch {
      toast.error("No se pudo copiar.");
    }
  };

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "group relative max-w-[86%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border bg-muted/70 text-foreground"
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          renderMarkdown(message.content)
        )}
        {!isUser ? (
          <div className="absolute -right-2 -top-2 hidden flex-col gap-0.5 group-hover:flex">
            <button
              type="button"
              onClick={copyMessage}
              className="flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
              aria-label="Copiar respuesta"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            {onApply ? (
              <button
                type="button"
                onClick={() => onApply(message.content)}
                className="flex h-7 w-7 items-center justify-center rounded-full border bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                aria-label="Aplicar a la sección"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Dialog ─────────────────────────────────────────────────────────────────

export function AgentPromptChatDialog({
  open,
  onOpenChange,
  activeTab,
  currentDraft,
  promptPreview,
  promptId,
  onApplyDraft,
}: AgentPromptChatDialogProps) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showDraft, setShowDraft] = useState(false);
  const [genDescription, setGenDescription] = useState("");
  const [genStage, setGenStage] = useState<GenStage>("idle");
  const [genError, setGenError] = useState<string | null>(null);

  const welcome = useMemo(
    () =>
      createMessage(
        "assistant",
        `Estoy listo para ayudarte con ${TYPE_AI_LABELS[activeTab]}. Puedo mejorar prompts, crear formulas y revisar si el Agente IA quedara claro para WhatsApp.`
      ),
    [activeTab]
  );

  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);

  useEffect(() => {
    if (!open) return;
    setMessages([welcome]);
    setText("");
    setShowDraft(false);
  }, [open, welcome]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const handleClear = () => setMessages([welcome]);

  const handleApply = (text: string) => {
    if (!onApplyDraft) return;
    const previous = currentDraft;
    onApplyDraft(text);
    toast.success("Aplicado a la sección.", {
      action: {
        label: "Deshacer",
        onClick: () => onApplyDraft(previous),
      },
      duration: 5000,
    });
  };

  const sendText = async (value: string) => {
    const content = value.trim();
    if (!content || isSending) return;

    const userMessage = createMessage("user", content);
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setText("");
    setIsSending(true);

    try {
      const res = await sendAgentPromptChatAction({
        messages: nextMessages,
        context: {
          activeSection: TYPE_AI_LABELS[activeTab],
          sectionDraft: currentDraft,
          promptPreview,
        },
      });

      if (!res.success || !res.data?.message) {
        toast.error(res.message || "No se pudo consultar el asistente.");
        setMessages((current) => [
          ...current,
          createMessage("assistant", "No pude responder ahora. Revisa la configuracion de IA e intenta de nuevo."),
        ]);
        return;
      }

      setMessages((current) => [...current, res.data!.message]);
    } catch {
      toast.error("Error consultando el asistente.");
      setMessages((current) => [
        ...current,
        createMessage("assistant", "Ocurrio un error consultando el asistente. Intenta de nuevo."),
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendText(text);
  };

  const handleGenerate = async () => {
    if (!genDescription.trim() || !promptId || genStage === "running") return;
    setGenError(null);
    setGenStage("running");
    try {
      const saved = await autoSaveBeforeGenerate({ promptId });
      if (!saved.ok) throw new Error(saved.error);
      const gen = await generateFlowSections({ description: genDescription });
      if (!gen.ok) throw new Error(gen.error);
      const result = await applyAllGeneratedSections({ promptId, sections: gen.sections });
      if (!result.ok) throw new Error(result.error);
      setGenStage("done");
      setTimeout(() => window.location.reload(), 2000);
    } catch (e: any) {
      setGenError(e?.message ?? "Error inesperado. Intenta de nuevo.");
      setGenStage("error");
    }
  };

  const quickPrompts = QUICK_PROMPTS[activeTab];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(720px,92dvh)] w-[min(960px,calc(100vw-1.5rem))] max-w-none flex-col overflow-hidden p-0">
        <div className="relative grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[1fr_320px]">
          {/* Divisor vertical completo */}
          <div className="absolute inset-y-0 right-[320px] hidden w-px bg-border lg:block" />

          {/* ── Columna izquierda: chat ── */}
          <div className="flex h-full flex-col min-h-0">
            {/* Header */}
            <div className="shrink-0 border-b px-4 py-3">
              <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Bot className="h-3.5 w-3.5" />
                </span>
                Chat para mejorar Agente IA
                <span className="text-muted-foreground font-normal">·</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Sección: <span className="font-medium text-foreground">{TYPE_AI_LABELS[activeTab]}</span>
                </span>
                <button
                  type="button"
                  onClick={handleClear}
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Limpiar chat"
                  title="Limpiar chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </DialogTitle>
            </div>

            <ScrollArea className="min-h-0 flex-1 px-4 pt-3 pb-2">
              <div className="space-y-3">
                {messages.map((message) => (
                  <PromptChatBubble
                    key={message.id}
                    message={message}
                    onApply={onApplyDraft ? handleApply : undefined}
                  />
                ))}
                {isSending ? (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl border bg-muted/70 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Pensando...
                    </div>
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Mobile: atajos horizontales */}
            <div className="shrink-0 overflow-x-auto border-t px-3 py-2 lg:hidden">
              <div className="flex gap-2 w-max">
                {quickPrompts.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      disabled={isSending}
                      onClick={() => void sendText(item.text)}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <Icon className="h-3 w-3 shrink-0 text-primary" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="shrink-0 border-t p-3">
              <div className="flex items-center gap-2">
                <Textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Ej: Mejora este prompt para cierre de ventas sin sonar insistente..."
                  className="min-h-[36px] max-h-28 resize-y text-sm"
                  disabled={isSending}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-md"
                  disabled={isSending || !text.trim()}
                  aria-label="Enviar mensaje"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SendHorizontal className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* ── Sidebar derecha ── */}
          <aside className="hidden min-h-0 flex-col bg-muted/20 lg:flex overflow-y-auto">

            {/* Preview sección actual */}
            {currentDraft ? (
              <div className="shrink-0 border-b px-4 py-3">
                <button
                  type="button"
                  onClick={() => setShowDraft((v) => !v)}
                  className="flex w-full items-center justify-between text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3" />
                    VER SECCIÓN ACTUAL
                  </span>
                  {showDraft ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {showDraft ? (
                  <div className="mt-2 max-h-28 overflow-y-auto rounded-md border bg-background p-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {currentDraft}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Atajos */}
            <div className="flex flex-col gap-3 px-4 pt-3 pb-3">
              <p className="text-sm font-semibold">Atajos</p>
              <div className="space-y-2">
                {quickPrompts.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Button
                      key={item.label}
                      type="button"
                      variant="outline"
                      className="h-auto w-full justify-start gap-2 whitespace-normal px-3 py-2 text-left text-sm"
                      disabled={isSending}
                      onClick={() => void sendText(item.text)}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-primary" />
                      {item.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Separador */}
            <div className="border-t mx-4 mt-auto" />

            {/* Generar flujo */}
            <div className="flex flex-1 flex-col gap-3 p-4">
              <p className="text-sm font-semibold flex items-center gap-1.5 shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Generar flujo
              </p>
              {genStage === "running" ? (
                <div className="flex flex-col items-center gap-2 py-3 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-xs font-medium">Generando… (20-40 seg)</p>
                </div>
              ) : genStage === "done" ? (
                <div className="flex flex-col items-center gap-2 py-3 text-center">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  <p className="text-xs font-medium text-emerald-600">¡Listo! Recargando…</p>
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-3 min-h-0">
                  <textarea
                    className="flex-1 w-full rounded-md border bg-background p-2.5 text-xs resize-none overflow-y-auto focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                    placeholder={"Pega la info del negocio y la IA genera el flujo completo.\n\nEj: Somos academia en Bogotá. Cursos de barbería $8/clase, mecánica $10/clase.\nHorarios: Lun-Sáb 8am-6pm\nPago: Nequi 300..."}
                    value={genDescription}
                    onChange={(e) => setGenDescription(e.target.value)}
                  />
                  {genStage === "error" && genError ? (
                    <div className="flex flex-col gap-2 shrink-0">
                      <div className="flex items-start gap-1.5 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        {genError}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => {
                          setGenStage("idle");
                          setGenError(null);
                          void handleGenerate();
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reintentar
                      </Button>
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    className="w-full gap-2 shrink-0"
                    disabled={!genDescription.trim() || !promptId}
                    onClick={() => void handleGenerate()}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generar
                  </Button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
