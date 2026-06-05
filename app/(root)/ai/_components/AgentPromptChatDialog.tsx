"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Copy, Lightbulb, Loader2, SendHorizontal, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { sendAgentPromptChatAction } from "@/actions/ai-prompt-chat-actions";
import type { ChatMessage } from "@/types/ai-assistence-chat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TYPE_AI_LABELS, type AiSectionKey } from "./ai-section-labels";

type AgentPromptChatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: AiSectionKey;
  currentDraft: string;
  promptPreview: string;
};

const QUICK_PROMPTS = [
  {
    label: "Mejorar prompt",
    icon: Wand2,
    text: "Mejora el texto de esta seccion para que el Agente IA responda mas natural, claro y util por WhatsApp.",
  },
  {
    label: "Crear formula",
    icon: Lightbulb,
    text: "Crea una formula conversacional para esta seccion con objetivo, condicion, respuesta, excepcion y siguiente paso.",
  },
  {
    label: "Optimizar flujo",
    icon: Sparkles,
    text: "Revisa esta configuracion y dime que falta para mejorar el resultado del Agente IA sin hacerlo mas largo.",
  },
];

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: Date.now(),
  };
}

function PromptChatBubble({ message }: { message: ChatMessage }) {
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
        <div className="whitespace-pre-wrap">{message.content}</div>
        {!isUser ? (
          <button
            type="button"
            onClick={copyMessage}
            className="absolute -right-2 -top-2 hidden h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground group-hover:flex"
            aria-label="Copiar respuesta"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AgentPromptChatDialog({
  open,
  onOpenChange,
  activeTab,
  currentDraft,
  promptPreview,
}: AgentPromptChatDialogProps) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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
  }, [open, welcome]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(720px,92dvh)] w-[min(960px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </span>
            Chat para mejorar Agente IA
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Seccion actual: <span className="font-medium text-foreground">{TYPE_AI_LABELS[activeTab]}</span>
          </p>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_260px]">
          <div className="flex min-h-0 flex-col border-r">
            <ScrollArea className="min-h-0 flex-1 px-4 py-4">
              <div className="space-y-3">
                {messages.map((message) => (
                  <PromptChatBubble key={message.id} message={message} />
                ))}
                {isSending ? (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl border bg-muted/70 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Pensando...
                    </div>
                  </div>
                ) : null}
              </div>
            </ScrollArea>

            <form ref={formRef} onSubmit={handleSubmit} className="border-t p-3">
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

          <aside className="hidden min-h-0 flex-col gap-3 bg-muted/20 p-4 lg:flex">
            <div>
              <p className="text-sm font-semibold">Atajos</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Usa estos puntos de partida para obtener una respuesta lista para trabajar.
              </p>
            </div>
            <div className="space-y-2">
              {QUICK_PROMPTS.map((item) => {
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
            <div className="mt-auto rounded-md border bg-background p-3 text-xs leading-relaxed text-muted-foreground">
              Consejo: cuando te entregue una version lista, puedes copiarla y pegarla en la seccion del constructor.
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
