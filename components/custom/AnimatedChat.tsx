"use client";

import { useState, useEffect, useRef } from "react";
import { Bot, Mic, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMsg {
  id: number;
  from: "client" | "agent";
  type: "text" | "image" | "audio";
  text?: string;
  imageLabel?: string;
  imageEmoji?: string;
  typingMs?: number;
}

const CHAT_SEQUENCE: ChatMsg[] = [
  { id: 1,  from: "client", type: "text",  text: "Hola! ¿Tienen disponibilidad para una reserva este viernes?" },
  { id: 2,  from: "agent",  type: "text",  text: "¡Hola! 👋 Claro que sí. ¿Para cuántas personas y a qué hora?", typingMs: 1400 },
  { id: 3,  from: "client", type: "audio" },
  { id: 4,  from: "agent",  type: "text",  text: "🎧 Escuché tu mensaje. Mesa para 4 personas a las 7pm, ¿correcto?", typingMs: 1800 },
  { id: 5,  from: "agent",  type: "image", imageLabel: "Disponibilidad · Viernes", imageEmoji: "📅", typingMs: 800 },
  { id: 6,  from: "agent",  type: "text",  text: "✅ ¡Tenemos disponibilidad! ¿A qué nombre hago la reserva?", typingMs: 600 },
  { id: 7,  from: "client", type: "text",  text: "A nombre de Carlos García 😊" },
  { id: 8,  from: "agent",  type: "text",  text: "🎉 ¡Reserva confirmada!\n📅 Viernes · 7:00pm · Mesa para 4\nTe enviaré un recordatorio mañana.", typingMs: 1600 },
  { id: 9,  from: "client", type: "text",  text: "También quiero ver el menú del día" },
  { id: 10, from: "agent",  type: "image", imageLabel: "Menú del Día", imageEmoji: "🍽️", typingMs: 1000 },
  { id: 11, from: "client", type: "audio" },
  { id: 12, from: "agent",  type: "text",  text: "🛎️ ¡Anotado! 2 bandejas paisas y 2 limonadas para tu mesa. ¡Los esperamos el viernes! 😄", typingMs: 1800 },
];

export function AnimatedChat() {
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [visibleIds, isTyping]);

  useEffect(() => {
    let active = true;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const run = async () => {
      while (active) {
        setVisibleIds([]); setIsTyping(false);
        await sleep(1000);
        for (const msg of CHAT_SEQUENCE) {
          if (!active) return;
          if (msg.from === "agent") {
            setIsTyping(true);
            await sleep(msg.typingMs ?? 1400);
            if (!active) return;
            setIsTyping(false);
            await sleep(80);
          } else {
            await sleep(700);
          }
          if (!active) return;
          setVisibleIds((p) => [...p, msg.id]);
          await sleep(msg.from === "client" ? 800 : 1000);
        }
        await sleep(4000);
      }
    };
    run();
    return () => { active = false; };
  }, []);

  const visible = CHAT_SEQUENCE.filter((m) => visibleIds.includes(m.id));

  return (
    <div className="relative mx-auto" style={{ width: 280 }}>
      <div className="relative overflow-hidden rounded-[2.8rem] shadow-2xl shadow-black/70"
        style={{ border: "7px solid #1e2533", background: "#0b141a", height: 580,
          boxShadow: "0 0 0 1px #2d3748, 0 30px 80px rgba(0,0,0,0.7), inset 0 0 0 1px #0d1a21" }}>
        <div className="absolute left-1/2 top-2 z-20 h-[18px] w-[80px] -translate-x-1/2 rounded-full bg-black" />
        <div className="flex h-full flex-col" style={{ background: "#0b141a" }}>
          <div className="flex items-center justify-between px-5 pb-0 pt-4 text-[9px] font-semibold text-white/80">
            <span>9:41</span>
            <div className="flex items-center gap-1 text-[8px]"><span>●●●</span><span>WiFi</span><span>🔋</span></div>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2" style={{ background: "#1f2c34" }}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-white">Agente IA</p>
              <p className="text-[9px] text-green-400">● En línea</p>
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-2.5 py-3 scrollbar-hidden" style={{ background: "#0b141a" }}>
            {visible.map((msg) => (
              <div key={msg.id} className={cn("flex", msg.from === "client" ? "justify-end" : "justify-start")}>
                {msg.type === "text" && (
                  <div className="max-w-[80%] rounded-lg px-2.5 py-1.5 text-[10px] leading-relaxed whitespace-pre-line shadow"
                    style={{ background: msg.from === "client" ? "#005c4b" : "#202c33", color: "#e9edef",
                      borderRadius: msg.from === "client" ? "10px 10px 2px 10px" : "10px 10px 10px 2px" }}>
                    {msg.text}
                  </div>
                )}
                {msg.type === "audio" && (
                  <div className="flex items-center gap-2 px-2.5 py-2 shadow"
                    style={{ background: msg.from === "client" ? "#005c4b" : "#202c33",
                      borderRadius: msg.from === "client" ? "10px 10px 2px 10px" : "10px 10px 10px 2px" }}>
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500">
                      <Mic className="h-3 w-3 text-white" />
                    </div>
                    <div className="flex items-end gap-px" style={{ height: 18 }}>
                      {[3,5,9,6,4,8,5,3,7,5,3,6,4].map((h, i) => (
                        <div key={i} style={{ height: h * 1.8 + "px" }} className="w-0.5 rounded-full bg-white/50" />
                      ))}
                    </div>
                    <span className="text-[9px] text-white/60 shrink-0">0:06</span>
                  </div>
                )}
                {msg.type === "image" && (
                  <div className="overflow-hidden shadow"
                    style={{ borderRadius: msg.from === "client" ? "10px 10px 2px 10px" : "10px 10px 10px 2px" }}>
                    <div className="flex flex-col items-center justify-center gap-1.5 px-3"
                      style={{ width: 140, height: 90, background: "linear-gradient(135deg, #1a2634 0%, #202c33 100%)" }}>
                      <span className="text-xl">{msg.imageEmoji}</span>
                      <div className="flex items-center gap-1">
                        <ImageIcon className="h-2.5 w-2.5 text-slate-400" />
                        <span className="text-[9px] text-slate-300">{msg.imageLabel}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 px-3 py-2.5"
                  style={{ background: "#202c33", borderRadius: "10px 10px 10px 2px" }}>
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 px-2 py-2" style={{ background: "#1f2c34" }}>
            <div className="flex-1 rounded-full px-3 py-1.5 text-[10px] text-slate-500" style={{ background: "#2a3942" }}>
              Escribe un mensaje...
            </div>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500">
              <Mic className="h-3.5 w-3.5 text-white" />
            </div>
          </div>
          <div className="flex justify-center py-1.5" style={{ background: "#1f2c34" }}>
            <div className="h-0.5 w-14 rounded-full bg-white/25" />
          </div>
        </div>
      </div>
      <div className="absolute -right-[9px] top-28 rounded-r" style={{ width: 4, height: 48, background: "#1e2533" }} />
      <div className="absolute -left-[9px] top-24 rounded-l" style={{ width: 4, height: 32, background: "#1e2533" }} />
      <div className="absolute -left-[9px] top-[72px] rounded-l" style={{ width: 4, height: 18, background: "#1e2533" }} />
      <div className="absolute -left-[9px] top-36 rounded-l" style={{ width: 4, height: 32, background: "#1e2533" }} />
    </div>
  );
}
