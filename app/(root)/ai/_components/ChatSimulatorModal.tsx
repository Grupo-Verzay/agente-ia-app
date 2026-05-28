"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, RotateCcw, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { simulateChatMessage } from "@/actions/simulate-chat-actions";

type Message = { id: string; role: "user" | "assistant"; content: string };

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    promptId: string;
    businessName: string;
}

export function ChatSimulatorModal({ open, onOpenChange, promptId, businessName }: Props) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (open) setTimeout(() => textareaRef.current?.focus(), 100);
        if (!open) { setMessages([]); setInput(""); setError(null); }
    }, [open]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

    const send = async () => {
        const text = input.trim();
        if (!text || isLoading) return;

        setInput("");
        setError(null);

        const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
        const next = [...messages, userMsg];
        setMessages(next);
        setIsLoading(true);

        const res = await simulateChatMessage({
            promptId,
            messages: next.map(({ role, content }) => ({ role, content })),
        });

        setIsLoading(false);

        if (res.ok) {
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: res.reply }]);
        } else {
            setError(res.error);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    };

    const reset = () => { setMessages([]); setInput(""); setError(null); textareaRef.current?.focus(); };

    const initials = businessName ? businessName.charAt(0).toUpperCase() : "A";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg h-[585px] flex flex-col overflow-hidden p-0 gap-0">

                {/* Header estilo WhatsApp */}
                <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
                    <div className="h-9 w-9 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-none truncate">
                            {businessName || "Agente IA"}
                        </p>
                        <p className="text-xs text-emerald-500 mt-0.5">en línea · simulador</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs text-muted-foreground shrink-0"
                        onClick={reset}
                        disabled={messages.length === 0 && !error}
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reiniciar
                    </Button>
                </div>

                {/* Área de mensajes */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5"
                    style={{ backgroundImage: "radial-gradient(hsl(var(--muted)/0.4) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>

                    {/* Estado vacío */}
                    {messages.length === 0 && !isLoading && !error && (
                        <div className="flex flex-col items-center justify-center h-full text-center select-none">
                            <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                                <MessageSquare className="h-7 w-7 text-emerald-500" />
                            </div>
                            <p className="text-sm font-medium">Prueba tu agente</p>
                            <p className="text-xs text-muted-foreground mt-1.5 max-w-[200px] leading-relaxed">
                                Escribe como si fueras un cliente de WhatsApp y ve cómo responde el agente.
                            </p>
                        </div>
                    )}

                    {/* Mensajes */}
                    {messages.map((msg) => (
                        <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start items-end")}>
                            {msg.role === "assistant" && (
                                <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mb-0.5">
                                    {initials}
                                </div>
                            )}
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

                    {/* Typing indicator */}
                    {isLoading && (
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
                    )}

                    {/* Error inline */}
                    {error && (
                        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            {error}
                        </div>
                    )}

                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="px-4 pb-4 pt-3 border-t shrink-0 flex gap-2 items-end bg-card">
                    <Textarea
                        ref={textareaRef}
                        className="flex-1 min-h-[40px] max-h-[120px] resize-none text-sm leading-relaxed"
                        placeholder="Escribe un mensaje… (Enter para enviar)"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading}
                        rows={1}
                    />
                    <Button
                        size="icon"
                        className="h-10 w-10 shrink-0 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white"
                        onClick={send}
                        disabled={!input.trim() || isLoading}
                    >
                        {isLoading
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Send className="h-4 w-4" />}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
