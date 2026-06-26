"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Check, Zap, Users, Star, MessageCircle, Bot, Calendar,
  ArrowRight, Menu, X, XCircle, Bell, FileSpreadsheet, Mic,
  LayoutTemplate, GitBranch, BrainCircuit, ChevronDown, ChevronUp,
  Quote, ImageIcon, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type SubscriptionPlanItem } from "@/actions/subscription-plan-actions";
import type { TestimonialData, StatData } from "@/actions/reseller-plan-actions";

/* ─── Datos estáticos ─────────────────────────────────────────────────────── */

const PLAN_LABELS: Record<string, string> = {
  lite: "Lite", basico: "Básico", intermedio: "Intermedio",
  avanzado: "Avanzado", enterprise: "Enterprise", personalizado: "Agencias",
};
const PLAN_ORDER = ["lite", "basico", "intermedio", "avanzado", "enterprise", "personalizado"];
type BillingPeriod = "monthly" | "quarterly" | "yearly";
type AssistanceType = "IA" | "HUMANO";

const INTEGRATIONS = [
  { name: "WhatsApp Business",   color: "text-green-400 border-green-500/20 bg-green-500/5",      emoji: "💬" },
  { name: "OpenAI GPT-4",        color: "text-slate-300 border-white/10 bg-white/5",              emoji: "🤖" },
  { name: "Google Sheets",       color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5", emoji: "📊" },
  { name: "Google Calendar",     color: "text-blue-400 border-blue-500/20 bg-blue-500/5",          emoji: "📅" },
  { name: "Instagram",           color: "text-pink-400 border-pink-500/20 bg-pink-500/5",          emoji: "📸" },
  { name: "Excel",               color: "text-green-300 border-green-400/20 bg-green-400/5",       emoji: "📋" },
  { name: "Reservas Online",     color: "text-cyan-400 border-cyan-500/20 bg-cyan-500/5",          emoji: "🗓️" },
  { name: "CRM con Pipeline",    color: "text-violet-400 border-violet-500/20 bg-violet-500/5",    emoji: "📈" },
  { name: "Pagos y Cobros",      color: "text-yellow-400 border-yellow-500/20 bg-yellow-500/5",    emoji: "💳" },
  { name: "Respuestas 24/7",     color: "text-blue-300 border-blue-400/20 bg-blue-400/5",          emoji: "⚡" },
  { name: "Catálogos Digitales", color: "text-orange-400 border-orange-500/20 bg-orange-500/5",    emoji: "🛍️" },
  { name: "Seguimientos Auto",   color: "text-teal-400 border-teal-500/20 bg-teal-500/5",          emoji: "🔔" },
];

const INDUSTRIES = [
  { emoji: "🏥", name: "Clínicas y Salud",    description: "Agenda citas, recuerda turnos y responde preguntas frecuentes las 24 horas." },
  { emoji: "🏠", name: "Inmobiliarias",        description: "Califica leads automáticamente, agenda visitas y envía fichas de propiedades." },
  { emoji: "🍕", name: "Restaurantes",         description: "Toma pedidos por WhatsApp, gestiona reservas y envía el menú del día." },
  { emoji: "💅", name: "Centros de Estética",  description: "Agenda citas, recuerda tratamientos, vende paquetes y promociones." },
  { emoji: "🏋️", name: "Gimnasios",            description: "Gestiona membresías, recuerda pagos y responde sobre clases y horarios." },
  { emoji: "🛒", name: "E-commerce",           description: "Estado de pedidos, catálogo de productos, cobros y seguimiento de envíos." },
];

const PAIN_POINTS = [
  "Pierdes clientes por tardar horas en contestar",
  "Monitoreas el WhatsApp manualmente todo el día",
  "Las ventas caen por falta de seguimiento",
  "Contratas personal solo para responder mensajes",
];

const BEFORE = [
  "Respondes cuando puedes, no cuando el cliente necesita",
  "Leads que no esperan se van con la competencia",
  "Seguimientos olvidados = ventas perdidas",
  "Sin estructura ni datos de tus conversaciones",
  "Contratas más personal para escalar",
];
const AFTER = [
  "Responde 24/7 al instante, incluso de madrugada",
  "Ningún lead se escapa, todos son atendidos",
  "Seguimientos automáticos programados con precisión",
  "CRM completo con datos y reportes de cada cliente",
  "Escala tu negocio sin contratar a nadie más",
];

const FEATURES = [
  { icon: Mic,             title: "IA multimodal",            description: "Entiende audios, imágenes y texto en lenguaje natural. Tu agente interpreta cualquier formato que el cliente envíe." },
  { icon: Zap,             title: "Respuestas automáticas",   description: "Responde al instante según la intención de cada conversación: ventas, soporte, reservas o cobros." },
  { icon: Users,           title: "CRM con pipeline",         description: "Organiza leads con etiquetas, embudos de venta por etapas y reportes de conversión en tiempo real." },
  { icon: Calendar,        title: "Agenda y recordatorios",   description: "Tus clientes agendan citas desde WhatsApp y reciben recordatorios automáticos para reducir inasistencias." },
  { icon: Bell,            title: "Seguimientos automáticos", description: "Recordatorios de pagos pendientes, citas próximas y seguimientos de ventas sin escribir un solo mensaje." },
  { icon: FileSpreadsheet, title: "Google Sheets y Excel",    description: "Sincroniza tu CRM con hojas de cálculo de Google o exporta a Excel para analizar tus datos." },
];

const TESTIMONIALS = [
  { quote: "Antes tardaba horas en contestar. Desde que configuré el agente mis ventas crecieron un 40% y nunca pierdo un cliente en la madrugada.", name: "María González", city: "Bogotá, Colombia", business: "Clínica Dental",    initials: "MG", color: "bg-blue-600",   metric: "+40% ventas" },
  { quote: "En 5 minutos estaba funcionando. Mis clientes me preguntan quién contesta tan rápido — ni saben que es un agente automático.",             name: "Carlos Martínez", city: "Medellín, Colombia", business: "Inmobiliaria",    initials: "CM", color: "bg-violet-600", metric: "5 min setup" },
  { quote: "El seguimiento automático de citas me ahorró contratar una secretaria. Recuperé la inversión en la primera semana de uso.",                name: "Laura Rodríguez", city: "Cali, Colombia",    business: "Centro de Estética", initials: "LR", color: "bg-cyan-600",   metric: "ROI en 1 semana" },
];

const FAQS = [
  { q: "¿Necesito saber programar para configurarlo?",  a: "No. Está diseñado para personas sin conocimientos técnicos. Con las plantillas y el editor visual, cualquier persona puede configurar su agente en minutos." },
  { q: "¿Funciona con mi número de WhatsApp actual?",   a: "Sí. Se conecta a tu número actual mediante escaneo de QR. No necesitas un número nuevo ni WhatsApp Business API." },
  { q: "¿Cuánto tiempo tarda en estar activo?",         a: "En promedio 5 minutos desde el registro hasta la primera respuesta automática. La configuración básica es inmediata." },
  { q: "¿El agente suena como un bot?",                 a: "No. Puedes personalizar completamente el tono, la personalidad y el estilo de respuesta para que hable exactamente como tú o tu empresa." },
  { q: "¿Puedo cancelar en cualquier momento?",         a: "Sí, sin contratos ni penalizaciones. Cancelas cuando quieras desde tu panel de control." },
  { q: "¿Qué soporte tienen disponible?",              a: "Ofrecemos soporte por WhatsApp y videollamada en horario laboral. Los planes superiores incluyen configuración asistida por nuestro equipo." },
];

/* ─── Animaciones ─────────────────────────────────────────────────────────── */

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function FadeIn({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useInView();
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(20px)",
      transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

function AnimatedCounter({ to, suffix = "", decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true; obs.disconnect();
        const dur = 1200, fps = 60, total = Math.round((dur / 1000) * fps);
        let frame = 0;
        const id = setInterval(() => {
          frame++;
          const ease = 1 - Math.pow(1 - frame / total, 3);
          setVal(parseFloat((ease * to).toFixed(decimals)));
          if (frame >= total) { setVal(to); clearInterval(id); }
        }, 1000 / fps);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [to, decimals]);
  return <span ref={ref}>{decimals > 0 ? val.toFixed(decimals) : Math.round(val)}{suffix}</span>;
}

/* ─── Chat animado ────────────────────────────────────────────────────────── */

interface ChatMsg { id: number; from: "client" | "agent"; type: "text" | "image" | "audio"; text?: string; imageLabel?: string; imageEmoji?: string; typingMs?: number; }

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
  { id: 12, from: "agent",  type: "text",  text: "🛎️ ¡Anotado! 2 bandejas paisas y 2 limonadas. ¡Los esperamos el viernes! 😄", typingMs: 1800 },
];

function AnimatedChat() {
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [visibleIds, isTyping]);
  useEffect(() => {
    let active = true;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const run = async () => {
      while (active) {
        setVisibleIds([]); setIsTyping(false); await sleep(1000);
        for (const msg of CHAT_SEQUENCE) {
          if (!active) return;
          if (msg.from === "agent") { setIsTyping(true); await sleep(msg.typingMs ?? 1400); if (!active) return; setIsTyping(false); await sleep(80); }
          else { await sleep(700); }
          if (!active) return;
          setVisibleIds((p) => [...p, msg.id]);
          await sleep(msg.from === "client" ? 800 : 1000);
        }
        await sleep(4000);
      }
    };
    run(); return () => { active = false; };
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
            <span>9:41</span><div className="flex items-center gap-1 text-[8px]"><span>●●●</span><span>WiFi</span><span>🔋</span></div>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2" style={{ background: "#1f2c34" }}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500"><Bot className="h-4 w-4 text-white" /></div>
            <div><p className="text-[11px] font-semibold text-white">Agente IA</p><p className="text-[9px] text-green-400">● En línea</p></div>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-2.5 py-3" style={{ background: "#0b141a" }}>
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
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500"><Mic className="h-3 w-3 text-white" /></div>
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
                <div className="flex items-center gap-1 px-3 py-2.5" style={{ background: "#202c33", borderRadius: "10px 10px 10px 2px" }}>
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 px-2 py-2" style={{ background: "#1f2c34" }}>
            <div className="flex-1 rounded-full px-3 py-1.5 text-[10px] text-slate-500" style={{ background: "#2a3942" }}>Escribe un mensaje...</div>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500"><Mic className="h-3.5 w-3.5 text-white" /></div>
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

/* ─── StepCard ────────────────────────────────────────────────────────────── */

function StepCard({ step, accent, icon, title, description, items, checkColor }: {
  step: string; accent: string; icon: React.ReactNode;
  title: string; description: string; items: string[]; checkColor: string;
}) {
  const s = {
    blue:   { border: "border-blue-500/20",   from: "from-blue-600/10",   label: "text-blue-400",   bg: "bg-blue-600/20" },
    cyan:   { border: "border-cyan-500/20",   from: "from-cyan-600/10",   label: "text-cyan-400",   bg: "bg-cyan-600/20" },
    violet: { border: "border-violet-500/20", from: "from-violet-600/10", label: "text-violet-400", bg: "bg-violet-600/20" },
  }[accent]!;
  return (
    <div className={cn("relative flex flex-col gap-4 rounded-2xl border bg-gradient-to-b to-transparent p-6", s.border, s.from)}>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", s.bg)}>{icon}</div>
        <span className={cn("text-xs font-semibold uppercase tracking-widest", s.label)}>Paso {step}</span>
      </div>
      <div><h3 className="mb-1.5 text-lg font-bold text-white">{title}</h3><p className="text-sm text-slate-400">{description}</p></div>
      <ul className="space-y-1.5 text-xs text-slate-400">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2"><Check className={cn("h-3 w-3 shrink-0", checkColor)} />{item}</li>
        ))}
      </ul>
    </div>
  );
}

/* ─── PlanCard ────────────────────────────────────────────────────────────── */

function PlanCard({ plan, assistanceType, billingPeriod, whatsapp, resellerSlug, brand }: {
  plan: SubscriptionPlanItem; assistanceType: AssistanceType; billingPeriod: BillingPeriod; whatsapp: string; resellerSlug: string; brand: string | null;
}) {
  const isCustom = plan.plan === "personalizado";
  const price = billingPeriod === "monthly" ? plan.priceUSD
    : billingPeriod === "quarterly" ? (plan.priceQuarterly ?? plan.priceUSD)
    : (plan.priceYearly ?? plan.priceUSD);
  const checkoutUrl = billingPeriod === "monthly" ? plan.checkoutUrlMonthly
    : billingPeriod === "quarterly" ? (plan.checkoutUrlQuarterly ?? plan.checkoutUrlMonthly)
    : (plan.checkoutUrlYearly ?? plan.checkoutUrlMonthly);
  const billedNote = billingPeriod === "monthly" ? "Facturado mensualmente"
    : billingPeriod === "quarterly" ? `Facturado $${(price * 3).toFixed(0)} cada 3 meses`
    : `Facturado $${(price * 12).toFixed(0)} al año`;

  return (
    <div className={cn("relative flex flex-col rounded-xl border p-5 transition-all hover:bg-white/[0.07]",
      plan.isPopular && !brand ? "border-blue-500/50 bg-white/[0.07] shadow-lg shadow-blue-500/10" : plan.isPopular ? "bg-white/[0.07] shadow-lg" : "border-white/10 bg-white/5")}
         style={plan.isPopular && brand ? { borderColor: `${brand}66`, boxShadow: `0 10px 30px ${brand}18` } : undefined}>
      {plan.isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className={cn("flex items-center gap-1 px-3 text-xs text-white", brand ? "brand-btn" : "bg-blue-600")}><Star className="h-3 w-3" /> Popular</Badge>
        </div>
      )}
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-white">{PLAN_LABELS[plan.plan] ?? plan.plan}</h3>
          <Badge variant="outline" className="border-white/20 text-[10px] text-slate-400">
            {assistanceType === "IA"
              ? <span className="flex items-center gap-1"><Zap className="h-2.5 w-2.5" />IA</span>
              : <span className="flex items-center gap-1"><Users className="h-2.5 w-2.5" />Humano</span>}
          </Badge>
        </div>
        {plan.description && <p className="mt-1 text-xs text-slate-500">{plan.description}</p>}
      </div>
      <div className="mb-4">
        {isCustom ? (
          <div className="text-2xl font-bold text-slate-400">A consultar</div>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">${price}</span>
              <span className="text-sm text-slate-400">USD/mes</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{billedNote}</p>
          </>
        )}
        <p className="mt-0.5 text-xs text-slate-500">{plan.credits.toLocaleString()} créditos incluidos</p>
      </div>
      {plan.features.length > 0 && (
        <ul className="mb-5 flex-1 space-y-1.5">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
              <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", brand ? "brand-text" : "text-blue-400")} />{f}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto">
        {isCustom ? (
          <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full gap-2 border-white/20 bg-transparent text-white hover:bg-white/10">
              <MessageCircle className="h-4 w-4" /> Contactar
            </Button>
          </a>
        ) : checkoutUrl ? (
          <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
            <Button className={cn("w-full text-white", plan.isPopular ? (brand ? "brand-btn" : "bg-blue-600 hover:bg-blue-500") : "border border-white/10 bg-white/10 hover:bg-white/20")}>
              Comenzar ahora
            </Button>
          </a>
        ) : (
          <Link href={`/completar-registro?r=${resellerSlug}&plan=${plan.plan}`}>
            <Button className={cn("w-full text-white", plan.isPopular ? (brand ? "brand-btn" : "bg-blue-600 hover:bg-blue-500") : "border border-white/10 bg-white/10 hover:bg-white/20")}>
              Comenzar ahora
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

/* ─── Componente principal ────────────────────────────────────────────────── */

interface Props {
  plans: SubscriptionPlanItem[];
  businessName: string | null;
  slug: string;
  whatsappNumber: string | null;
  meetingUrl: string | null;
  primaryColor: string | null;
  bgColor: string | null;
  headline: string | null;
  subheadline: string | null;
  logoUrl: string | null;
  instagram: string | null;
  facebook: string | null;
  videoUrl: string | null;
  ctaHeadline: string | null;
  ctaSubtitle: string | null;
  testimonials: TestimonialData[] | null;
  stats: StatData[] | null;
  showAssistanceIA?: boolean;
  showAssistanceHUMANO?: boolean;
}

export function ResellerLandingClient({ plans, businessName, slug, whatsappNumber, meetingUrl, primaryColor, bgColor, headline, subheadline, logoUrl, instagram, facebook, videoUrl, ctaHeadline, ctaSubtitle, testimonials, stats, showAssistanceIA = true, showAssistanceHUMANO = true }: Props) {
  // Un tipo se muestra solo si el reseller lo habilitó (flag de su landing) y hay
  // al menos un plan de ese tipo. Si solo queda uno, no se muestra el selector IA/Humana.
  const hasIA = showAssistanceIA && plans.some((p) => p.assistanceType === "IA");
  const hasHumano = showAssistanceHUMANO && plans.some((p) => p.assistanceType === "HUMANO");
  const availableTypes: AssistanceType[] = [];
  if (hasIA) availableTypes.push("IA");
  if (hasHumano) availableTypes.push("HUMANO");
  const showAssistanceToggle = availableTypes.length > 1;

  const [assistanceType, setAssistanceType] = useState<AssistanceType>(hasIA ? "IA" : "HUMANO");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("yearly");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Tipo efectivo: si el seleccionado dejó de tener planes activos, usa el disponible.
  const effectiveType: AssistanceType = availableTypes.includes(assistanceType)
    ? assistanceType
    : (availableTypes[0] ?? "IA");

  const brandName = businessName ?? slug;
  const waNumber = whatsappNumber?.replace(/\D/g, "") ?? "";
  const waLink = waNumber ? `https://wa.me/${waNumber}` : "#";
  const brand = primaryColor && /^#[0-9a-fA-F]{3,8}$/.test(primaryColor) ? primaryColor : null;
  const heroTitle = headline ?? "Automatiza tu WhatsApp";
  const heroSub = subheadline ?? "Transforma tus mensajes en un sistema automático de ventas y atención al cliente — desde el primer día, sin programación.";

  const visiblePlans = [...plans]
    .filter((p) => p.assistanceType === effectiveType && p.isActive)
    .sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan));

  const bg = bgColor && /^#[0-9a-fA-F]{3,8}$/.test(bgColor) ? bgColor : null;

  return (
    <div className="min-h-full text-white" style={bg ? { backgroundColor: bg } : undefined}>
      {brand && (
        <style>{`
          .brand-btn { background-color: ${brand} !important; }
          .brand-btn:hover { filter: brightness(1.12); }
          .brand-text { color: ${brand} !important; }
          .brand-border { border-color: ${brand}55 !important; }
          .brand-bg-soft { background-color: ${brand}18 !important; }
        `}</style>
      )}

      {/* ══ NAVBAR ══════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-3 sm:px-12 lg:px-16">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={brandName} className="h-8 max-w-[120px] object-contain" />
            ) : (
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", brand ? "brand-btn" : "bg-blue-600")}>
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}
            {!logoUrl && <span className="text-lg font-bold text-white">{brandName}</span>}
          </div>
          <nav className="hidden items-center gap-7 sm:flex">
            {[["#how","Cómo funciona"],["#features","Funciones"],["#pricing","Precios"],["#faq","FAQ"]].map(([href,label]) => (
              <a key={href} href={href} className="text-sm text-slate-400 transition-colors hover:text-white">{label}</a>
            ))}
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-slate-300 hover:bg-white/10 hover:text-white">Iniciar sesión</Button>
            </Link>
            <Link href={`/completar-registro?r=${slug}`}>
              <Button size="sm" className={cn("text-white", brand ? "brand-btn" : "bg-blue-600 hover:bg-blue-500")}>Comenzar gratis</Button>
            </Link>
          </div>
          <button className="p-2 text-slate-400 sm:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="space-y-3 border-t border-white/10 px-4 py-3 sm:hidden">
            {[["#features","Funciones"],["#pricing","Precios"],["#faq","FAQ"]].map(([href,label]) => (
              <a key={href} href={href} className="block text-sm text-slate-300" onClick={() => setMobileMenuOpen(false)}>{label}</a>
            ))}
            <div className="flex gap-2 pt-1">
              <Link href="/login" className="flex-1">
                <Button variant="outline" size="sm" className="w-full border-white/20 bg-transparent text-white hover:bg-white/10">Iniciar sesión</Button>
              </Link>
              <Link href={`/completar-registro?r=${slug}`} className="flex-1">
                <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-500">Registrarse</Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ══ HERO ════════════════════════════════════════════════════════════ */}
      <section className="relative pb-6 pt-8">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className={cn("absolute right-0 top-0 h-[500px] w-[500px] rounded-full blur-3xl", !brand && "bg-blue-600/15")}
               style={brand ? { backgroundColor: `${brand}22` } : undefined} />
          <div className={cn("absolute -left-20 top-20 h-80 w-80 rounded-full blur-3xl", !brand && "bg-cyan-500/10")}
               style={brand ? { backgroundColor: `${brand}12` } : undefined} />
        </div>
        <div className="relative mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <div className="grid min-h-[75vh] grid-cols-1 items-center gap-8 lg:grid-cols-2">
            <div className="flex flex-col justify-center">
              <Badge className={cn("mb-4 inline-flex w-fit items-center gap-1.5 border px-3 py-1", brand ? "brand-text brand-bg-soft brand-border" : "border-blue-500/20 bg-blue-500/10 text-blue-400")}>
                <MessageCircle className="h-3 w-3" /> Agente IA para WhatsApp
              </Badge>
              <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl xl:text-6xl">
                {heroTitle}
              </h1>
              <p className="mb-5 text-base text-slate-400 sm:text-lg xl:text-xl">{heroSub}</p>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:flex-nowrap">
                <Link href={`/completar-registro?r=${slug}`}>
                  <Button size="lg" className={cn("w-full gap-2 px-8 text-white md:w-auto", brand ? "brand-btn" : "bg-blue-600 hover:bg-blue-500")}>
                    Comenzar gratis <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="#pricing">
                  <Button size="lg" variant="outline" className="w-full border-white/20 bg-transparent px-8 text-white hover:bg-white/10 md:w-auto">
                    Ver planes
                  </Button>
                </a>
                {meetingUrl && (
                  <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="lg" variant="outline" className="w-full gap-2 border-cyan-500/40 bg-cyan-500/10 px-8 text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-200 md:w-auto">
                      <Calendar className="h-4 w-4" /> Agendar asesoría
                    </Button>
                  </a>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {["Sin tarjeta de crédito", "Cancela cuando quieras", "Soporte incluido"].map((t) => (
                  <span key={t} className="flex items-center gap-1 text-xs text-slate-500">
                    <Check className="h-3 w-3 text-green-500" /> {t}
                  </span>
                ))}
              </div>
              {(() => {
                const heroStats = (stats && stats.length > 0 ? stats.slice(0, 3) : [
                  { value: "+500", label: "Negocios activos" },
                  { value: "4.9★", label: "Calificación promedio" },
                  { value: "+40%", label: "Aumento en ventas" },
                ]).filter((s) => s.value);
                return heroStats.length > 0 ? (
                  <div className={`mt-5 grid grid-cols-${heroStats.length} gap-6 border-t border-white/10 pt-5`}>
                    {heroStats.map((s) => (
                      <div key={s.label}>
                        <div className={cn("text-2xl font-bold", brand ? "brand-text" : "text-blue-400")}>{s.value}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{s.label}</div>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>
            <div className="flex items-center justify-center lg:justify-end">
              <div className="relative">
                <AnimatedChat />
                <div className={cn("absolute -inset-8 -z-10 rounded-full blur-3xl", !brand && "bg-blue-600/15")}
                     style={brand ? { backgroundColor: `${brand}20` } : undefined} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ SOCIAL PROOF ════════════════════════════════════════════════════ */}
      <section className="py-8">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="grid grid-cols-2 gap-6 rounded-2xl border border-white/5 bg-white/[0.02] px-8 py-6 text-center sm:grid-cols-4">
              {[{ to: 500, suffix: "+", label: "Negocios activos" }, { to: 1, suffix: "M+", label: "Mensajes respondidos" }, { to: 4.9, suffix: "★", label: "Calificación promedio", decimals: 1 }, { to: 40, suffix: "%", label: "Aumento en ventas" }].map((s) => (
                <div key={s.label}>
                  <div className={cn("text-3xl font-bold", brand ? "brand-text" : "text-blue-400")}><AnimatedCounter to={s.to} suffix={s.suffix} decimals={s.decimals} /></div>
                  <div className="mt-1 text-xs text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══ MARQUEE ═════════════════════════════════════════════════════════ */}
      <section className="py-6">
        <p className="mb-4 text-center text-xs font-medium uppercase tracking-widest text-slate-500">Compatible e integrado con</p>
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <div className="relative overflow-hidden rounded-xl"
            style={{ maskImage: "linear-gradient(to right, transparent 0%, white 10%, white 90%, transparent 100%)", WebkitMaskImage: "linear-gradient(to right, transparent 0%, white 10%, white 90%, transparent 100%)" }}>
            <div className="flex w-max gap-3 py-1" style={{ animation: "marquee 28s linear infinite" }}>
              {[...INTEGRATIONS, ...INTEGRATIONS].map((int, i) => (
                <span key={i} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-medium", int.color)}>
                  <span>{int.emoji}</span>{int.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ PAIN POINTS ═════════════════════════════════════════════════════ */}
      <section className="py-6 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <p className="mb-4 text-center text-sm font-medium uppercase tracking-wider text-slate-500">¿Te suena familiar?</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PAIN_POINTS.map((pain) => (
                <div key={pain} className="flex items-start gap-3 rounded-xl border border-red-500/10 bg-red-500/5 px-4 py-3">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <span className="text-sm text-slate-300">{pain}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-sm text-slate-400">
              <span className="font-medium text-blue-400">Agente IA resuelve todo esto</span> — automáticamente.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ══ ANTES vs DESPUÉS ════════════════════════════════════════════════ */}
      <section className="py-6">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <h2 className="mb-5 text-center text-2xl font-bold text-white sm:text-3xl">¿Qué cambia con Agente IA?</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
                <div className="mb-4 flex items-center gap-2"><XCircle className="h-5 w-5 text-red-400" /><span className="font-semibold text-red-400">Sin Agente IA</span></div>
                <ul className="space-y-3">{BEFORE.map((item) => (<li key={item} className="flex items-start gap-2.5 text-sm text-slate-400"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />{item}</li>))}</ul>
              </div>
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
                <div className="mb-4 flex items-center gap-2"><Check className="h-5 w-5 text-blue-400" /><span className="font-semibold text-blue-400">Con Agente IA</span></div>
                <ul className="space-y-3">{AFTER.map((item) => (<li key={item} className="flex items-start gap-2.5 text-sm text-slate-300"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />{item}</li>))}</ul>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══ INDUSTRIAS ══════════════════════════════════════════════════════ */}
      <section className="py-6 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Funciona para tu tipo de negocio</h2>
              <p className="mt-2 text-slate-400">Adaptado a las necesidades de cada industria, desde el primer día.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {INDUSTRIES.map((ind, i) => (
                <FadeIn key={ind.name} delay={i * 60}>
                  <div className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-blue-500/30 hover:bg-white/[0.07]">
                    <span className="text-2xl">{ind.emoji}</span>
                    <div><h3 className="font-semibold text-white">{ind.name}</h3><p className="mt-1 text-sm text-slate-400">{ind.description}</p></div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══ 3 PASOS ═════════════════════════════════════════════════════════ */}
      <section id="how" className="py-6">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Tu agente listo en 3 pasos</h2>
              <p className="mt-2 text-slate-400">Sin programación. Sin conocimientos técnicos. Solo configura y funciona.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StepCard step="1" accent="blue"   icon={<LayoutTemplate className="h-5 w-5 text-blue-400" />}  title="Plantillas por objetivo" description="Elige la plantilla para tu tipo de negocio: ventas, soporte, reservas o cobros." items={["Ventas y captación de leads","Atención y soporte al cliente","Reservas y citas","Cobros y recordatorios"]} checkColor="text-blue-400" />
              <StepCard step="2" accent="cyan"   icon={<GitBranch className="h-5 w-5 text-cyan-400" />}       title="Flujo de tu negocio"     description="Personaliza el flujo de conversación: qué preguntar, qué datos capturar y cómo responder." items={["Preguntas y respuestas automáticas","Captura de datos del cliente","Envío de catálogos y archivos","Derivación a humano cuando se requiera"]} checkColor="text-cyan-400" />
              <StepCard step="3" accent="violet" icon={<BrainCircuit className="h-5 w-5 text-violet-400" />}  title="Instrucción IA"          description="Dale personalidad a tu agente: cómo hablar, qué ofrecer, cómo manejar objeciones." items={["Tono y personalidad del agente","Conocimiento de tus productos","Manejo de objeciones frecuentes","Memoria del contexto del cliente"]} checkColor="text-violet-400" />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══ VIDEO ═══════════════════════════════════════════════════════════ */}
      {videoUrl && (() => {
        const embedUrl = videoUrl.includes("youtube.com/watch?v=")
          ? videoUrl.replace("youtube.com/watch?v=", "youtube.com/embed/").split("&")[0]
          : videoUrl.includes("youtu.be/")
          ? `https://www.youtube.com/embed/${videoUrl.split("youtu.be/")[1].split("?")[0]}`
          : videoUrl;
        return (
          <section className="py-6 bg-white/[0.02]">
            <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
              <FadeIn>
                <div className="overflow-hidden rounded-2xl border border-white/10" style={{ aspectRatio: "16/9" }}>
                  <iframe src={embedUrl} className="h-full w-full" allowFullScreen title="Video de presentación" />
                </div>
              </FadeIn>
            </div>
          </section>
        );
      })()}

      {/* ══ FUNCIONES ═══════════════════════════════════════════════════════ */}
      <section id="features" className="py-6 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Todo lo que hace por ti</h2>
              <p className="mt-2 text-slate-400">Un agente que trabaja solo, aprende de tu negocio y nunca descansa.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <FadeIn key={f.title} delay={i * 60}>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-blue-500/30 hover:bg-white/[0.07]">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                      <f.icon className="h-4 w-4 text-blue-400" />
                    </div>
                    <h3 className="mb-1.5 font-semibold text-white">{f.title}</h3>
                    <p className="text-sm text-slate-400">{f.description}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══ TESTIMONIOS ═════════════════════════════════════════════════════ */}
      <section className="py-6">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Lo que dicen nuestros clientes</h2>
              <p className="mt-2 text-slate-400">Negocios reales que ya automatizaron su atención al cliente.</p>
            </div>
            {(() => {
              const AVATAR_COLORS = ["bg-blue-600", "bg-violet-600", "bg-cyan-600"];
              const activeTestimonials = (testimonials && testimonials.some((t) => t.quote))
                ? testimonials.filter((t) => t.quote).map((t, i) => ({
                    ...t,
                    initials: t.name ? t.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "?",
                    color: AVATAR_COLORS[i % AVATAR_COLORS.length],
                  }))
                : TESTIMONIALS;
              return (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {activeTestimonials.map((t, i) => (
                    <FadeIn key={i} delay={i * 80}>
                      <div className="flex h-full flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-5">
                        <div className="flex items-start justify-between">
                          <Quote className="h-5 w-5 text-blue-400/50" />
                          <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400">✓ Verificado</span>
                        </div>
                        <p className="flex-1 text-sm text-slate-300 leading-relaxed">"{t.quote}"</p>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, j) => (<Star key={j} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />))}
                          {t.metric && <span className="ml-1.5 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400">{t.metric}</span>}
                        </div>
                        <div className="flex items-center gap-3 border-t border-white/10 pt-3">
                          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", t.color)}>{t.initials}</div>
                          <div>
                            <p className="text-sm font-semibold text-white">{t.name}</p>
                            <p className="text-xs text-slate-500">{[t.business, t.city].filter(Boolean).join(" · ")}</p>
                          </div>
                        </div>
                      </div>
                    </FadeIn>
                  ))}
                </div>
              );
            })()}
          </FadeIn>
        </div>
      </section>

      {/* ══ PRECIOS ═════════════════════════════════════════════════════════ */}
      <section id="pricing" className="py-6 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Planes y Precios</h2>
              <p className="mt-2 text-slate-400">Sin contratos. Cancela cuando quieras.</p>
              <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                {([["monthly","Mensual",null],["quarterly","Trimestral","−14%"],["yearly","Anual","−22%"]] as [BillingPeriod,string,string|null][]).map(([p,label,badge]) => (
                  <button key={p} onClick={() => setBillingPeriod(p)}
                    className={cn("flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all", billingPeriod === p ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white")}>
                    {label}
                    {badge && <span className={cn("rounded-full px-1.5 py-px text-[9px] font-bold", billingPeriod === p ? "bg-green-400/20 text-green-300" : "bg-green-500/15 text-green-500")}>{badge}</span>}
                  </button>
                ))}
              </div>
              {showAssistanceToggle && (
                <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                  <button onClick={() => setAssistanceType("IA")} className={cn("flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all", effectiveType === "IA" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white")}>
                    <Zap className="h-3.5 w-3.5" /> Asistencia IA
                  </button>
                  <button onClick={() => setAssistanceType("HUMANO")} className={cn("flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all", effectiveType === "HUMANO" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white")}>
                    <Users className="h-3.5 w-3.5" /> Asistencia Humana
                  </button>
                </div>
              )}
              <p className="mt-5 text-xs text-slate-500">Precios en USD · Sin tarjeta de crédito requerida</p>
            </div>
            {visiblePlans.length === 0 ? (
              <p className="text-center text-slate-500">Planes próximamente disponibles.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visiblePlans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} assistanceType={effectiveType} billingPeriod={billingPeriod} whatsapp={waNumber} resellerSlug={slug} brand={brand} />
                ))}
              </div>
            )}
          </FadeIn>
        </div>
      </section>

      {/* ══ FAQ ═════════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-6">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Preguntas frecuentes</h2>
              <p className="mt-2 text-slate-400">Todo lo que necesitas saber antes de empezar.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FAQS.map((faq, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between px-5 py-4 text-left">
                    <span className="pr-4 text-sm font-medium text-white">{faq.q}</span>
                    {openFaq === i ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                  </button>
                  {openFaq === i && (
                    <div className="border-t border-white/10 px-5 pb-4 pt-3">
                      <p className="text-sm leading-relaxed text-slate-400">{faq.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══ CTA FINAL ═══════════════════════════════════════════════════════ */}
      <section className="py-6">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div
              className={cn("rounded-2xl border px-10 py-8 text-center", !brand && !bg && "border-blue-500/20 bg-gradient-to-br from-blue-600/20 via-slate-800/40 to-slate-900/60")}
              style={brand || bg
                ? { borderColor: brand ? `${brand}55` : "#3b82f620", background: `linear-gradient(to bottom right, #1e293b, ${bg ?? "#0f172a"})` }
                : undefined
              }>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">{ctaHeadline ?? "¿Listo para empezar?"}</h2>
              <p className="mt-4 text-lg text-slate-400">{ctaSubtitle ?? "Configúralo en 5 minutos. Tu agente empieza a responder desde el primer día."}</p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href={`/completar-registro?r=${slug}`}>
                  <Button size="lg" className="gap-2 bg-blue-600 px-10 text-white hover:bg-blue-500">
                    Crear cuenta gratis <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white">Ya tengo cuenta →</Button>
                </Link>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
                {["Sin tarjeta de crédito", "Cancela cuando quieras", "Soporte incluido"].map((t) => (
                  <span key={t} className="flex items-center gap-1 text-xs text-slate-500"><ShieldCheck className="h-3 w-3 text-green-500" /> {t}</span>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/10 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-8 sm:flex-row sm:justify-between sm:px-12 lg:px-16">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={brandName} className="h-7 max-w-[100px] object-contain" />
            ) : (
              <>
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", brand ? "brand-btn" : "bg-blue-600")}><Bot className="h-3.5 w-3.5 text-white" /></div>
                <span className="font-semibold text-white">{brandName}</span>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} {brandName}. Todos los derechos reservados.</p>
          <div className="flex flex-wrap items-center gap-5 text-sm text-slate-500">
            <a href="#features" className="transition-colors hover:text-slate-300">Funciones</a>
            <a href="#pricing" className="transition-colors hover:text-slate-300">Precios</a>
            <a href="#faq" className="transition-colors hover:text-slate-300">FAQ</a>
            {instagram && <a href={instagram} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-pink-400">Instagram</a>}
            {facebook && <a href={facebook} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-blue-400">Facebook</a>}
            <Link href="/login" className="transition-colors hover:text-slate-300">Acceso</Link>
          </div>
        </div>
      </footer>

      {/* ══ WHATSAPP FLOTANTE ═══════════════════════════════════════════════ */}
      {waNumber && (
        <a href={waLink} target="_blank" rel="noopener noreferrer" title={`Contactar a ${brandName}`}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 shadow-xl shadow-green-500/30 transition-all hover:scale-110 hover:bg-green-400">
          <MessageCircle className="h-6 w-6 text-white" />
        </a>
      )}
    </div>
  );
}
