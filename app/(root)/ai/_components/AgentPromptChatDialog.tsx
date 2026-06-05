"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, Bot, CheckCircle2, ChevronDown, ChevronUp,
  Copy, FileText, GitBranch, Lightbulb, Loader2, MessageSquare, PenLine, RefreshCw,
  RotateCcw, Send, SendHorizontal, Sparkles, Trash2, Wand2, Zap,
} from "lucide-react";
import { toast } from "sonner";

import { sendAgentPromptChatAction } from "@/actions/ai-prompt-chat-actions";
import { simulateChatMessage } from "@/actions/simulate-chat-actions";
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
type SimMessage = { id: string; role: "user" | "assistant"; content: string };

type AgentPromptChatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: AiSectionKey;
  currentDraft: string;
  promptPreview: string;
  promptId?: string;
  businessName?: string;
  onApplyDraft?: (text: string) => void;
};

const QUICK_PROMPTS: Record<AiSectionKey, QuickPrompt[]> = {
  business: [
    { label: "Datos clave faltantes", icon: Lightbulb, text: "Sugiere qué datos del negocio faltan o deberían añadirse para que el Agente IA responda mejor." },
    { label: "Mejorar la descripción", icon: Wand2, text: "Mejora la descripción del negocio para que sea más clara y atractiva para clientes por WhatsApp." },
    { label: "Usar tono profesional", icon: PenLine, text: "Ajusta el tono de la información del negocio para sonar más profesional y confiable." },
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

const SECTION_DESCRIPTIONS: Record<AiSectionKey, string> = {
  business: "El Agente IA usa esta sección para presentar el negocio y responder preguntas básicas como horarios, ubicación, contacto y descripción general.",
  training: "Define cómo el Agente IA saluda y arranca cada conversación. Un buen inicio genera confianza desde el primer mensaje.",
  faq: "Aquí viven las respuestas a las preguntas más frecuentes. Entre más completa esté, menos veces el agente quedará sin respuesta.",
  products: "El Agente IA usa esta sección para presentar, describir y cotizar productos o servicios cuando el cliente los solicita.",
  more: "Información adicional que el agente puede usar en situaciones específicas: políticas, restricciones, promociones o datos extra del negocio.",
  management: "Configura cómo el agente maneja situaciones difíciles: quejas, escalaciones a humano, seguimientos y casos fuera de lo normal.",
};

const OPTIMIZE_PROMPT: QuickPrompt = {
  label: "Optimizar el prompt",
  icon: Zap,
  text: "Revisa esta sección y dime qué cambiar, agregar o quitar para mejorar el resultado del Agente IA sin hacerlo más largo.",
};

const SIMULATE_PROMPT: QuickPrompt = {
  label: "Simular conversación",
  icon: MessageSquare,
  text: "",
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
  businessName,
  onApplyDraft,
}: AgentPromptChatDialogProps) {
  // ── Assistant chat state
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showDraft, setShowDraft] = useState(false);

  // ── Simulator state
  const [simulatorMode, setSimulatorMode] = useState(false);
  const [simMessages, setSimMessages] = useState<SimMessage[]>([]);
  const [simInput, setSimInput] = useState("");
  const [simIsLoading, setSimIsLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const simBottomRef = useRef<HTMLDivElement>(null);

  // ── Generate flow state
  const [genDescription, setGenDescription] = useState("");
  const [genStage, setGenStage] = useState<GenStage>("idle");
  const [genStep, setGenStep] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [generatorMode, setGeneratorMode] = useState(false);

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
    setSimulatorMode(false);
    setSimMessages([]);
    setSimInput("");
    setSimError(null);
    setGeneratorMode(false);
    setGenStage("idle");
    setGenStep(0);
    setGenError(null);
  }, [open, welcome]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    simBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [simMessages, simIsLoading]);

  const handleClear = () => setMessages([welcome]);

  const handleApply = (text: string) => {
    if (!onApplyDraft) return;
    const previous = currentDraft;
    onApplyDraft(text);
    toast.success("Aplicado a la sección.", {
      action: { label: "Deshacer", onClick: () => onApplyDraft(previous) },
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

  // ── Simulator handlers

  const simSend = async () => {
    const content = simInput.trim();
    if (!content || simIsLoading || !promptId) return;

    const userMsg: SimMessage = { id: crypto.randomUUID(), role: "user", content };
    const next = [...simMessages, userMsg];
    setSimMessages(next);
    setSimInput("");
    setSimIsLoading(true);
    setSimError(null);

    const res = await simulateChatMessage({
      promptId,
      messages: next.map(({ role, content }) => ({ role, content })),
    });

    setSimIsLoading(false);

    if (res.ok) {
      setSimMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: res.reply }]);
    } else {
      setSimError(res.error ?? "Error inesperado.");
    }
  };

  const simReset = () => {
    setSimMessages([]);
    setSimInput("");
    setSimError(null);
  };

  const handleGenerate = async () => {
    if (!genDescription.trim() || !promptId || genStage === "running") return;
    setGenError(null);
    setGenStage("running");
    setGenStep(0);
    setGeneratorMode(true);
    try {
      const saved = await autoSaveBeforeGenerate({ promptId });
      if (!saved.ok) throw new Error(saved.error);
      setGenStep(1);
      const gen = await generateFlowSections({ description: genDescription });
      if (!gen.ok) throw new Error(gen.error);
      setGenStep(2);
      const result = await applyAllGeneratedSections({ promptId, sections: gen.sections });
      if (!result.ok) throw new Error(result.error);
      setGenStep(3);
      setGenStage("done");
      setTimeout(() => window.location.reload(), 2000);
    } catch (e: any) {
      setGenError(e?.message ?? "Error inesperado. Intenta de nuevo.");
      setGenStage("error");
    }
  };

  const quickPrompts = QUICK_PROMPTS[activeTab];
  const initials = businessName ? businessName.charAt(0).toUpperCase() : "A";

  const GEN_STEPS = [
    "Guardando configuración actual",
    "Generando secciones con IA",
    "Aplicando al prompt",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(585px,92dvh)] w-[min(960px,calc(100vw-1.5rem))] max-w-none flex-col overflow-hidden p-0">

        {/* ── Header compartido full-width ── */}
        <div className="shrink-0 border-b">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">
            <div className="flex items-center px-4 py-3">
              <DialogTitle className="flex w-full items-center gap-2 text-sm font-semibold">
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
            {currentDraft ? (
              <div className="hidden lg:flex items-center border-l px-4">
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
              </div>
            ) : null}
          </div>
        </div>

        <div className="relative grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[1fr_320px]">
          {/* Divisor vertical completo */}
          <div className="absolute inset-y-0 right-[320px] hidden w-px bg-border lg:block" />

          {/* ── Columna izquierda ── */}
          <div className="flex flex-col min-h-0">

            {generatorMode ? (
              /* ── Modo generador ── */
              <>
                {/* Mini header */}
                <div className="shrink-0 border-b bg-card px-4 py-2 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-none">Generar flujo</p>
                    <p className="text-xs text-muted-foreground mt-0.5">La IA crea todas las secciones</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-muted-foreground px-2 shrink-0"
                    disabled={genStage === "running"}
                    onClick={() => { setGeneratorMode(false); setGenStage("idle"); setGenStep(0); setGenError(null); }}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Salir
                  </Button>
                </div>

                {/* Contenido */}
                {genStage === "idle" || genStage === "error" ? (
                  <div className="flex flex-1 flex-col gap-3 p-4 min-h-0">
                    <p className="text-xs text-muted-foreground shrink-0">
                      Describe el negocio y la IA genera el flujo completo automáticamente.
                    </p>
                    <textarea
                      className="flex-1 w-full rounded-md border bg-background p-2.5 text-sm resize-none overflow-y-auto focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 min-h-0"
                      placeholder={"Ej: Somos academia en Bogotá. Cursos de barbería $8/clase, mecánica $10/clase.\nHorarios: Lun-Sáb 8am-6pm\nPago: Nequi 300..."}
                      value={genDescription}
                      onChange={(e) => setGenDescription(e.target.value)}
                    />
                    {genStage === "error" && genError ? (
                      <div className="flex items-start gap-1.5 text-xs text-destructive shrink-0">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        {genError}
                      </div>
                    ) : null}
                    <Button
                      size="sm"
                      className="w-full gap-2 shrink-0"
                      disabled={!genDescription.trim() || !promptId}
                      onClick={() => void handleGenerate()}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Generar
                    </Button>
                  </div>
                ) : genStage === "running" || genStage === "done" ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center min-h-0">
                    <div className="w-full max-w-xs space-y-4">
                      {GEN_STEPS.map((step, i) => (
                        <div
                          key={i}
                          className={cn("flex items-center gap-3 text-sm transition-colors",
                            genStep > i ? "text-foreground" :
                            genStep === i ? "text-primary" :
                            "text-muted-foreground/40"
                          )}
                        >
                          {genStep > i ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                          ) : genStep === i ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                          ) : (
                            <div className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/20" />
                          )}
                          {step}
                        </div>
                      ))}
                    </div>
                    {genStage === "done" ? (
                      <p className="text-sm font-medium text-emerald-600">¡Listo! Recargando…</p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : simulatorMode ? (
              /* ── Modo simulador ── */
              <>
                {/* Mini header estilo WhatsApp */}
                <div className="shrink-0 border-b bg-card px-4 py-2 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-none truncate">{businessName || "Agente IA"}</p>
                    <p className="text-xs text-emerald-500 mt-0.5">en línea · simulador</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground px-2"
                      onClick={simReset}
                      disabled={simMessages.length === 0 && !simError}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reiniciar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground px-2"
                      onClick={() => setSimulatorMode(false)}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Salir
                    </Button>
                  </div>
                </div>

                {/* Mensajes del simulador */}
                <div
                  className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5"
                  style={{ backgroundImage: "radial-gradient(hsl(var(--muted)/0.4) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
                >
                  {simMessages.length === 0 && !simIsLoading && !simError ? (
                    <div className="flex flex-col items-center justify-center h-full text-center select-none">
                      <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                        <MessageSquare className="h-6 w-6 text-emerald-500" />
                      </div>
                      <p className="text-sm font-medium">Escribe como cliente</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[200px] leading-relaxed">
                        El agente responderá como si estuviera en WhatsApp.
                      </p>
                    </div>
                  ) : null}

                  {simMessages.map((msg) => (
                    <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start items-end")}>
                      {msg.role === "assistant" ? (
                        <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mb-0.5">
                          {initials}
                        </div>
                      ) : null}
                      <div className={cn(
                        "max-w-[78%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words leading-relaxed shadow-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-none"
                          : "bg-card border rounded-bl-none"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {simIsLoading ? (
                    <div className="flex gap-2 items-end">
                      <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mb-0.5">
                        {initials}
                      </div>
                      <div className="bg-card border px-4 py-3 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.3s]" />
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.15s]" />
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" />
                      </div>
                    </div>
                  ) : null}

                  {simError ? (
                    <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {simError}
                    </div>
                  ) : null}

                  <div ref={simBottomRef} />
                </div>

                {/* Input del simulador */}
                <div className="shrink-0 border-t px-4 py-3 flex gap-2 items-end bg-card">
                  <Textarea
                    className="flex-1 min-h-[36px] max-h-28 resize-none text-sm"
                    placeholder="Escribe un mensaje como cliente…"
                    value={simInput}
                    onChange={(e) => setSimInput(e.target.value)}
                    disabled={simIsLoading || !promptId}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void simSend(); }
                    }}
                  />
                  <Button
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white"
                    onClick={() => void simSend()}
                    disabled={!simInput.trim() || simIsLoading || !promptId}
                  >
                    {simIsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            ) : (
              /* ── Modo asistente ── */
              <>
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
                    {[...quickPrompts, OPTIMIZE_PROMPT, SIMULATE_PROMPT].map((item) => {
                      const Icon = item.icon;
                      const isSimulate = item.label === SIMULATE_PROMPT.label;
                      return (
                        <button
                          key={item.label}
                          type="button"
                          disabled={isSending}
                          onClick={() => isSimulate ? setSimulatorMode(true) : void sendText(item.text)}
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
              </>
            )}
          </div>

          {/* ── Sidebar derecha ── */}
          <aside className="hidden min-h-0 flex-col bg-muted/20 lg:flex overflow-y-auto">

            {/* Draft expandido */}
            {showDraft && currentDraft ? (
              <div className="shrink-0 border-b px-4 py-2">
                <div className="max-h-28 overflow-y-auto rounded-md border bg-background p-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {currentDraft}
                </div>
              </div>
            ) : null}

            {/* Atajos */}
            <div className="flex flex-1 flex-col gap-3 px-4 pt-3 pb-3">
              <p className="text-sm font-semibold">Atajos</p>
              <div className="space-y-2">
                {[...quickPrompts, OPTIMIZE_PROMPT, SIMULATE_PROMPT].map((item) => {
                  const Icon = item.icon;
                  const isSimulate = item.label === SIMULATE_PROMPT.label;
                  return (
                    <Button
                      key={item.label}
                      type="button"
                      variant="outline"
                      className="h-auto w-full justify-start gap-2 whitespace-normal px-3 py-2 text-left text-sm"
                      disabled={isSending}
                      onClick={() => { isSimulate ? setSimulatorMode(true) : setText(item.text); }}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-primary" />
                      {item.label}
                    </Button>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start gap-2 px-3 py-2 text-left text-sm"
                  onClick={() => setGeneratorMode(true)}
                >
                  <GitBranch className="h-4 w-4 shrink-0 text-primary" />
                  Generar flujo del negocio
                </Button>
              </div>
            </div>

            {/* Descripción de la sección */}
            <div className="border-t mx-0 mb-0" />
            <div className="mx-4 mb-4 mt-3 rounded-lg border bg-muted/40 px-3 py-3">
              <p className="text-xs font-semibold text-foreground mb-1.5">
                Sección: {TYPE_AI_LABELS[activeTab]}
              </p>
              <p className="text-xs leading-relaxed text-foreground/70">
                {SECTION_DESCRIPTIONS[activeTab]}
              </p>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
