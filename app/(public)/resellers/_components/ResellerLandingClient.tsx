"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Check, Zap, Star, MessageCircle, Bot, ArrowRight,
  Menu, X, ShieldCheck, TrendingUp, DollarSign, Globe,
  Headphones, BarChart3, Layers, ChevronDown, ChevronUp,
  Quote, BadgeCheck, Rocket, HandCoins, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getActiveResellerAccessPlans, type SubscriptionPlanItem } from "@/actions/subscription-plan-actions";
import type { TestimonialData, StatData } from "@/actions/reseller-plan-actions";
import { AnimatedChat } from "@/components/custom/AnimatedChat";

/* ─── Datos ────────────────────────────────────────────────────────────────── */

const BENEFITS = [
  {
    icon: Globe,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    title: "Tu marca, tu negocio",
    description:
      "Usa tu propio logo, nombre y dominio. El cliente ve tu marca en todo momento. Nosotros somos el motor invisible detrás.",
  },
  {
    icon: DollarSign,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    title: "Ingresos recurrentes",
    description:
      "Cobra a tus clientes el precio que tú defines. Cada mes que sigan activos, tú ganas. Sin límite de clientes ni techo de ingresos.",
  },
  {
    icon: TrendingUp,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    title: "Escala sin límites",
    description:
      "No necesitas infraestructura propia. Agrega clientes indefinidamente desde tu panel de reseller. La plataforma escala contigo.",
  },
  {
    icon: Headphones,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    title: "Soporte técnico incluido",
    description:
      "Nosotros atendemos los problemas técnicos para que tú te enfoques en vender. Tienes un canal dedicado de soporte para resellers.",
  },
  {
    icon: BarChart3,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    title: "Panel de control propio",
    description:
      "Administra todos tus clientes desde un único dashboard. Ve métricas, activa/desactiva cuentas y gestiona planes en segundos.",
  },
  {
    icon: Layers,
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    title: "Producto completo listo",
    description:
      "No construyas desde cero. Tienes CRM, agente IA, agenda, workflows y más — listos para vender desde el primer día.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "1",
    accent: "blue",
    icon: <Rocket className="h-5 w-5 text-blue-400" />,
    title: "Regístrate como reseller",
    description:
      "Crea tu cuenta en minutos. Recibirás acceso a tu panel de reseller con tu subdominio personalizado.",
    items: [
      "Registro en menos de 5 minutos",
      "Panel de administración dedicado",
      "Subdominio o dominio propio",
      "Acceso inmediato a todas las funciones",
    ],
  },
  {
    step: "2",
    accent: "cyan",
    icon: <Globe className="h-5 w-5 text-cyan-400" />,
    title: "Configura tu marca",
    description:
      "Personaliza tu landing page con tu logo, colores, precios y planes. Tus clientes verán únicamente tu identidad.",
    items: [
      "Logo y colores de tu empresa",
      "Define tus propios precios",
      "Landing page lista para vender",
      "Enlace de registro para tus clientes",
    ],
  },
  {
    step: "3",
    accent: "violet",
    icon: <HandCoins className="h-5 w-5 text-violet-400" />,
    title: "Vende y cobra",
    description:
      "Registra tus clientes, ellos configuran su agente IA y tú cobras mes a mes. Nosotros operamos la plataforma.",
    items: [
      "Clientes ilimitados",
      "Tú fijas el precio de venta",
      "Ingresos recurrentes mensuales",
      "Sin costos ocultos ni sorpresas",
    ],
  },
];

const INCLUDED = [
  "Agente IA para WhatsApp 24/7",
  "CRM con pipeline de ventas",
  "Agenda y reservas online",
  "Workflows automatizados",
  "Seguimientos y recordatorios",
  "Google Sheets integrado",
  "Multi-agente y equipos",
  "Soporte de imágenes, audios y PDFs",
  "Landing page personalizable",
  "Panel de reseller completo",
  "Soporte técnico para resellers",
  "Actualizaciones incluidas",
];

const IDEAL_FOR = [
  { emoji: "💻", title: "Agencias digitales", description: "Amplía tu portafolio con una herramienta de alto valor y alta retención de clientes." },
  { emoji: "🤝", title: "Consultores de ventas", description: "Ofrece automatización como parte de tu servicio y cobra de forma recurrente." },
  { emoji: "📱", title: "Freelancers tech", description: "Monetiza tu conocimiento vendiendo una plataforma lista con márgenes sólidos." },
  { emoji: "🏢", title: "Empresas de software", description: "Agrega el agente IA a tu stack actual y ofrece más valor a tus clientes existentes." },
  { emoji: "📊", title: "Marketing y CRM", description: "Complementa tu oferta de CRM o automatización con WhatsApp IA como canal clave." },
  { emoji: "🌐", title: "Emprendedores tech", description: "Lanza tu propio negocio de IA sin construir nada desde cero." },
];

const TESTIMONIALS = [
  {
    quote: "En 3 meses pasé de 0 a 18 clientes activos. La plataforma se vende sola porque los resultados son inmediatos. Mis clientes me renuevan sin preguntar.",
    name: "Andrés Morales",
    city: "Bogotá, Colombia",
    business: "Agencia Digital",
    initials: "AM",
    color: "bg-blue-600",
    metric: "18 clientes / 3 meses",
  },
  {
    quote: "Lo que más valoro es el soporte. Nunca me quedé solo con un problema técnico. Puedo vender con confianza porque sé que hay un equipo detrás.",
    name: "Valeria Ríos",
    city: "Medellín, Colombia",
    business: "Consultora de Ventas",
    initials: "VR",
    color: "bg-violet-600",
    metric: "ROI en semana 1",
  },
  {
    quote: "Mis clientes ven mi logo y mi nombre. Para ellos soy yo quien construyó la herramienta. El white label es perfecto para posicionar mi marca.",
    name: "Diego Vargas",
    city: "Ciudad de México",
    business: "Freelancer Tech",
    initials: "DV",
    color: "bg-emerald-600",
    metric: "+$2,400 USD / mes",
  },
];

const FAQS = [
  {
    q: "¿Mis clientes sabrán que usan Agente IA?",
    a: "No, a menos que tú lo decidas. El white label es completo: tu logo, tu nombre, tu dominio. Nosotros somos el motor invisible.",
  },
  {
    q: "¿Cuánto puedo cobrar a mis clientes?",
    a: "Tú defines el precio de venta libremente. Muchos resellers aplican márgenes de 2x a 4x sobre el costo de la plataforma.",
  },
  {
    q: "¿Hay un límite de clientes que puedo tener?",
    a: "No. Puedes tener tantos clientes como quieras. Cada cliente tiene su propia cuenta y configuración separada.",
  },
  {
    q: "¿Qué pasa si un cliente tiene un problema técnico?",
    a: "Tienes acceso a un canal de soporte dedicado para resellers. Los problemas técnicos los resolvemos nosotros para que tú no tengas que hacerlo.",
  },
  {
    q: "¿Necesito conocimientos técnicos para ser reseller?",
    a: "No. El panel de reseller es intuitivo. Si puedes usar WhatsApp y Google, puedes administrar tu negocio de reseller.",
  },
  {
    q: "¿Cómo registro nuevos clientes?",
    a: "Tienes un enlace único de registro. Cuando un cliente lo usa, queda asociado a tu cuenta de reseller automáticamente.",
  },
];

/* ─── Plan constants ───────────────────────────────────────────────────────── */

const PLAN_LABELS: Record<string, string> = {
  lite: "Lite", basico: "Básico", intermedio: "Intermedio",
  avanzado: "Avanzado", enterprise: "Enterprise", personalizado: "Planes mixtos",
};
const PLAN_ORDER = ["lite", "basico", "intermedio", "avanzado", "enterprise", "personalizado"];
type PackSize = "pack5" | "pack10" | "pack25";

const PACK_OPTIONS: { value: PackSize; label: string; qty: number }[] = [
  { value: "pack5",  label: "Pack 5 licencias",  qty: 5  },
  { value: "pack10", label: "Pack 10 licencias", qty: 10 },
  { value: "pack25", label: "Pack 25 licencias", qty: 25 },
];

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function FadeIn({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function AnimatedCounter({ to, suffix = "", prefix = "", decimals = 0 }: { to: number; suffix?: string; prefix?: string; decimals?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        obs.disconnect();
        const dur = 1200; const fps = 60; const total = Math.round((dur / 1000) * fps);
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
  return <span ref={ref}>{prefix}{decimals > 0 ? val.toFixed(decimals) : Math.round(val)}{suffix}</span>;
}

function ResellerPlanCard({ plan, packSize }: {
  plan: SubscriptionPlanItem; packSize: PackSize;
}) {
  const isCustom = plan.plan === "personalizado";
  const pack = PACK_OPTIONS.find((p) => p.value === packSize)!;
  const price = packSize === "pack5"
    ? plan.priceUSD
    : packSize === "pack10"
    ? (plan.priceQuarterly ?? plan.priceUSD)
    : (plan.priceYearly ?? plan.priceUSD);
  const checkoutUrl = packSize === "pack5"
    ? plan.checkoutUrlMonthly
    : packSize === "pack10"
    ? (plan.checkoutUrlQuarterly ?? plan.checkoutUrlMonthly)
    : (plan.checkoutUrlYearly ?? plan.checkoutUrlMonthly);
  const pricePerLicense = price > 0 ? (price / pack.qty).toFixed(2) : null;

  return (
    <div className={cn("relative flex flex-col rounded-xl border p-5 transition-all hover:bg-white/[0.07]",
      plan.isPopular ? "border-blue-500/50 bg-white/[0.07] shadow-lg shadow-blue-500/10" : "border-white/10 bg-white/5")}>
      {plan.isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="flex items-center gap-1 bg-blue-600 px-3 text-xs text-white"><Star className="h-3 w-3" /> Popular</Badge>
        </div>
      )}
      <div className="mb-3">
        <h3 className="font-bold text-white">{PLAN_LABELS[plan.plan] ?? plan.plan}</h3>
        {plan.description && <p className="mt-1 text-xs text-slate-500">{plan.description}</p>}
      </div>
      <div className="mb-4">
        {isCustom ? (
          <div className="text-2xl font-bold text-slate-400">A consultar</div>
        ) : price > 0 ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">${price}</span>
              <span className="text-sm text-slate-400">USD / {pack.label}</span>
            </div>
            {pricePerLicense && (
              <p className="mt-0.5 text-xs text-slate-500">${pricePerLicense} USD por licencia</p>
            )}
          </>
        ) : (
          <div className="text-2xl font-bold text-slate-400">Sin precio</div>
        )}
        <p className="mt-0.5 text-xs text-slate-500">{plan.credits.toLocaleString()} créditos por licencia</p>
      </div>
      {plan.features.length > 0 && (
        <ul className="mb-5 flex-1 space-y-1.5">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />{f}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto">
        {isCustom ? (
          <a href="https://wa.me/573233612620" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full gap-2 border-white/20 bg-transparent text-white hover:bg-white/10">
              <MessageCircle className="h-4 w-4" /> Contactar
            </Button>
          </a>
        ) : checkoutUrl ? (
          <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
            <Button className={cn("w-full", plan.isPopular
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "border border-white/10 bg-white/10 text-white hover:bg-white/20")}>
              Comenzar ahora
            </Button>
          </a>
        ) : (
          <Link href={`/completar-registro?tipo=reseller&plan=${plan.plan}`}>
            <Button className={cn("w-full", plan.isPopular
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "border border-white/10 bg-white/10 text-white hover:bg-white/20")}>
              Comenzar ahora
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function StepCard({ step, accent, icon, title, description, items }: {
  step: string; accent: "blue" | "cyan" | "violet";
  icon: React.ReactNode; title: string; description: string; items: string[];
}) {
  const s = {
    blue:   { border: "border-blue-500/20",   from: "from-blue-600/10",   label: "text-blue-400",   bg: "bg-blue-600/20",   check: "text-blue-400" },
    cyan:   { border: "border-cyan-500/20",   from: "from-cyan-600/10",   label: "text-cyan-400",   bg: "bg-cyan-600/20",   check: "text-cyan-400" },
    violet: { border: "border-violet-500/20", from: "from-violet-600/10", label: "text-violet-400", bg: "bg-violet-600/20", check: "text-violet-400" },
  }[accent];
  return (
    <div className={cn("relative flex flex-col gap-4 rounded-2xl border bg-gradient-to-b to-transparent p-6", s.border, s.from)}>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", s.bg)}>{icon}</div>
        <span className={cn("text-xs font-semibold uppercase tracking-widest", s.label)}>Paso {step}</span>
      </div>
      <div>
        <h3 className="mb-1.5 text-lg font-bold text-white">{title}</h3>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      <ul className="space-y-1.5 text-xs text-slate-400">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <Check className={cn("h-3 w-3 shrink-0", s.check)} />{item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Props ────────────────────────────────────────────────────────────────── */

interface ResellerLandingClientProps {
  whatsappNumber?: string | null;
  logoUrl?: string | null;
  meetingUrl?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  ctaHeadline?: string | null;
  ctaSubtitle?: string | null;
  testimonials?: TestimonialData[] | null;
  stats?: StatData[] | null;
}

/* ─── Componente principal ─────────────────────────────────────────────────── */

export function ResellerLandingClient({
  whatsappNumber,
  logoUrl,
  meetingUrl,
  instagram,
  facebook,
  ctaHeadline,
  ctaSubtitle,
  testimonials,
  stats,
}: ResellerLandingClientProps = {}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [packSize, setPackSize] = useState<PackSize>("pack5");

  useEffect(() => {
    getActiveResellerAccessPlans().then((res) => {
      if (res.success) setPlans(res.data);
      setPlansLoading(false);
    });
  }, []);

  const visiblePlans = plans
    .filter((p) => p.assistanceType === "IA")
    .sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan));

  return (
    <div className="min-h-full text-white">

      {/* ══ NAVBAR ══════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-3 sm:px-12 lg:px-16">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="Agente IA" className="h-8 max-w-[120px] object-contain" />
            ) : (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-bold text-white">Agente IA</span>
              </>
            )}
            <Badge className="ml-1 border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-400">Resellers</Badge>
          </div>
          <nav className="hidden items-center gap-7 sm:flex">
            {[["#benefits","Beneficios"],["#how","Cómo funciona"],["#pricing","Precios"],["#included","Qué incluye"],["#faq","FAQ"]].map(([href, label]) => (
              <a key={href} href={href} className="text-sm text-slate-400 transition-colors hover:text-white">{label}</a>
            ))}
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-slate-300 hover:bg-white/10 hover:text-white">Iniciar sesión</Button>
            </Link>
            <Link href="/completar-registro?tipo=reseller">
              <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-500">
                <Rocket className="h-3.5 w-3.5" /> Ser reseller
              </Button>
            </Link>
          </div>
          <button className="p-2 text-slate-400 sm:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="space-y-3 border-t border-white/10 px-4 py-3 sm:hidden">
            {[["#benefits","Beneficios"],["#how","Cómo funciona"],["#pricing","Precios"],["#included","Qué incluye"],["#faq","FAQ"]].map(([href, label]) => (
              <a key={href} href={href} className="block text-sm text-slate-300" onClick={() => setMobileMenuOpen(false)}>{label}</a>
            ))}
            <div className="flex gap-2 pt-1">
              <Link href="/login" className="flex-1">
                <Button variant="outline" size="sm" className="w-full border-white/20 bg-transparent text-white hover:bg-white/10">Iniciar sesión</Button>
              </Link>
              <Link href="/completar-registro?tipo=reseller" className="flex-1">
                <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-500">Ser reseller</Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ══ HERO ════════════════════════════════════════════════════════════ */}
      <section className="relative pb-10 pt-12">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute right-0 top-0 h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-3xl" />
          <div className="absolute -left-20 top-20 h-80 w-80 rounded-full bg-violet-500/8 blur-3xl" />
          <div className="absolute bottom-0 left-1/2 h-60 w-96 -translate-x-1/2 rounded-full bg-emerald-500/5 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <div className="grid min-h-[75vh] grid-cols-1 items-center gap-8 lg:grid-cols-2">

            {/* Columna izquierda: texto */}
            <div className="flex flex-col justify-center">
              <Badge className="mb-5 inline-flex w-fit items-center gap-1.5 border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-400">
                <BadgeCheck className="h-4 w-4" /> Programa White Label
              </Badge>
              <h1 className="mb-5 text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
                <span className="block">Vende el Agente IA</span>
                <span className="block bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">con tu propia marca</span>
              </h1>
              <p className="mb-8 text-base text-slate-400 sm:text-lg">
                Conviértete en reseller y ofrece la plataforma de automatización de WhatsApp más completa del mercado — con tu nombre, tu logo y tus precios. Sin construir nada desde cero.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/completar-registro?tipo=reseller">
                  <Button size="lg" className="gap-2 bg-blue-600 px-10 text-white hover:bg-blue-500">
                    Registrarme como reseller <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                {meetingUrl ? (
                  <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="lg" variant="outline" className="gap-2 border-white/20 bg-transparent px-10 text-white hover:bg-white/10">
                      <Zap className="h-4 w-4" /> Agendar reunión
                    </Button>
                  </a>
                ) : (
                  <a href="#how">
                    <Button size="lg" variant="outline" className="border-white/20 bg-transparent px-10 text-white hover:bg-white/10">
                      Cómo funciona
                    </Button>
                  </a>
                )}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                {["Sin costos ocultos", "Panel de reseller incluido", "Soporte dedicado"].map((t) => (
                  <span key={t} className="flex items-center gap-1 text-xs text-slate-500">
                    <Check className="h-3 w-3 text-green-500" /> {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Columna derecha: phone mockup */}
            <div className="flex items-center justify-center lg:justify-end">
              <div className="relative">
                <AnimatedChat />
                <div className="absolute -inset-8 -z-10 rounded-full bg-blue-600/15 blur-3xl" />
                <div className="absolute -inset-4 -z-10 rounded-full bg-green-500/5 blur-2xl" />
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-12">
            <FadeIn>
              <div className="grid grid-cols-2 gap-6 rounded-2xl border border-white/5 bg-white/[0.02] px-8 py-6 text-center sm:grid-cols-4">
                {[
                  { to: 500, suffix: "+", label: "Negocios automatizados", prefix: "" },
                  { to: 40,  suffix: "+", label: "Resellers activos",      prefix: "" },
                  { to: 4,   suffix: "x", label: "Margen promedio",        prefix: "" },
                  { to: 95,  suffix: "%", label: "Tasa de retención",      prefix: "" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-3xl font-bold text-blue-400">
                      <AnimatedCounter to={s.to} suffix={s.suffix} prefix={s.prefix} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{s.label}</div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ══ BENEFICIOS ═════════════════════════════════════════════════════ */}
      <section id="benefits" className="py-8 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">¿Por qué ser reseller de Agente IA?</h2>
              <p className="mt-2 text-slate-400">Un negocio digital con producto probado, soporte técnico y margen sólido desde el día uno.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFITS.map((b, i) => (
                <FadeIn key={b.title} delay={i * 60}>
                  <div className={cn("flex flex-col gap-3 rounded-xl border p-5 transition-colors hover:bg-white/[0.07]", b.border, "bg-white/5")}>
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", b.bg)}>
                      <b.icon className={cn("h-5 w-5", b.color)} />
                    </div>
                    <div>
                      <h3 className="mb-1 font-semibold text-white">{b.title}</h3>
                      <p className="text-sm text-slate-400">{b.description}</p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══ CÓMO FUNCIONA ══════════════════════════════════════════════════ */}
      <section id="how" className="py-8">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Cómo funciona el programa</h2>
              <p className="mt-2 text-slate-400">Tres pasos para tener tu negocio de Agente IA operando.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {HOW_IT_WORKS.map((step) => (
                <StepCard
                  key={step.step}
                  step={step.step}
                  accent={step.accent as "blue" | "cyan" | "violet"}
                  icon={step.icon}
                  title={step.title}
                  description={step.description}
                  items={step.items}
                />
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══ QUÉ INCLUYE ════════════════════════════════════════════════════ */}
      <section id="included" className="py-8 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
              <div>
                <h2 className="mb-3 text-2xl font-bold text-white sm:text-3xl">Todo incluido en una sola plataforma</h2>
                <p className="mb-6 text-slate-400">
                  Tus clientes tienen acceso a todas las funcionalidades de Agente IA desde el primer día. No necesitas integrar nada extra.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {INCLUDED.map((item) => (
                    <div key={item} className="flex items-center gap-2.5">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
                        <Check className="h-3 w-3 text-blue-400" />
                      </div>
                      <span className="text-sm text-slate-300">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-600/10 to-transparent p-7">
                <div className="mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                  <span className="font-semibold text-white">Ejemplo de margen</span>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Tu costo mensual (plataforma)", value: "$X / cliente", color: "text-slate-400" },
                    { label: "Precio que tú cobras", value: "Libre", color: "text-slate-300" },
                    { label: "Margen promedio del mercado", value: "2x – 4x", color: "text-emerald-400" },
                    { label: "Con 10 clientes al 3x", value: "~$X×30 / mes", color: "text-blue-400" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0">
                      <span className="text-sm text-slate-400">{row.label}</span>
                      <span className={cn("text-sm font-semibold", row.color)}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  * Los precios de la plataforma se comparten con el reseller al registrarse. Los márgenes dependen del precio que tú decidas cobrar.
                </p>
                <a href="#pricing" className="mt-5 block">
                  <Button className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-500">
                    Ver precios reales <ArrowRight className="h-4 w-4" />
                  </Button>
                </a>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══ IDEAL PARA ═════════════════════════════════════════════════════ */}
      <section className="py-8">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">¿Para quién es el programa?</h2>
              <p className="mt-2 text-slate-400">Ideal para quienes ya tienen clientes o quieren construir un negocio digital escalable.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {IDEAL_FOR.map((item, i) => (
                <FadeIn key={item.title} delay={i * 60}>
                  <div className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-blue-500/30 hover:bg-white/[0.07]">
                    <span className="text-2xl">{item.emoji}</span>
                    <div>
                      <h3 className="font-semibold text-white">{item.title}</h3>
                      <p className="mt-1 text-sm text-slate-400">{item.description}</p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══ TESTIMONIOS ════════════════════════════════════════════════════ */}
      <section className="py-8 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Lo que dicen nuestros resellers</h2>
              <p className="mt-2 text-slate-400">Personas reales que ya están generando ingresos con el programa.</p>
            </div>
            {(() => {
              const AVATAR_COLORS = ["bg-blue-600", "bg-violet-600", "bg-emerald-600"];
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
                          <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400">✓ Reseller activo</span>
                        </div>
                        <p className="flex-1 text-sm leading-relaxed text-slate-300">"{t.quote}"</p>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <Star key={j} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          ))}
                          {t.metric && <span className="ml-1.5 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400">{t.metric}</span>}
                        </div>
                        <div className="flex items-center gap-3 border-t border-white/10 pt-3">
                          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", t.color)}>
                            {t.initials}
                          </div>
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

      {/* ══ PRECIOS ════════════════════════════════════════════════════════ */}
      <section id="pricing" className="py-8">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Planes y Precios</h2>
              <p className="mt-2 text-slate-400">Conoce el costo de la plataforma para que puedas definir tu margen de reventa.</p>

              {/* Pack toggle */}
              <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                {PACK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPackSize(opt.value)}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                      packSize === opt.value ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <p className="mt-5 text-xs text-slate-500">Precios en USD · Tú defines cuánto cobrar a tus clientes</p>
            </div>
            {plansLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
            ) : visiblePlans.length === 0 ? (
              <p className="text-center text-slate-500">Planes próximamente disponibles.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visiblePlans.map((plan) => (
                  <ResellerPlanCard key={plan.id} plan={plan} packSize={packSize} />
                ))}
              </div>
            )}
          </FadeIn>
        </div>
      </section>

      {/* ══ FAQ ════════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-8">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Preguntas frecuentes</h2>
              <p className="mt-2 text-slate-400">Todo lo que necesitas saber antes de unirte al programa.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FAQS.map((faq, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left"
                  >
                    <span className="pr-4 text-sm font-medium text-white">{faq.q}</span>
                    {openFaq === i
                      ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                      : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    }
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

      {/* ══ CTA FINAL ══════════════════════════════════════════════════════ */}
      <section className="py-8">
        <div className="mx-auto max-w-6xl px-8 sm:px-12 lg:px-16">
          <FadeIn>
            <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-600/20 via-slate-800/40 to-slate-900/60 px-10 py-10 text-center">
              <Badge className="mb-4 inline-flex items-center gap-1.5 border-blue-500/30 bg-blue-500/10 text-blue-400">
                <Zap className="h-3 w-3" /> Plazas disponibles
              </Badge>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                {ctaHeadline ?? "¿Listo para empezar tu negocio?"}
              </h2>
              <p className="mt-4 max-w-xl mx-auto text-lg text-slate-400">
                {ctaSubtitle ?? "Regístrate hoy como reseller, personaliza tu plataforma y empieza a vender. Sin inversión en desarrollo, sin infraestructura propia."}
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/completar-registro?tipo=reseller">
                  <Button size="lg" className="gap-2 bg-blue-600 px-10 text-white hover:bg-blue-500">
                    Registrarme como reseller <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                {meetingUrl && (
                  <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="lg" variant="outline" className="gap-2 border-white/20 bg-transparent px-10 text-white hover:bg-white/10">
                      <Zap className="h-4 w-4" /> Agendar reunión
                    </Button>
                  </a>
                )}
                <a href={`https://wa.me/${(whatsappNumber ?? "573233612620").replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="outline" className="gap-2 border-green-500/30 bg-green-500/5 px-10 text-green-300 hover:bg-green-500/10 hover:text-green-200">
                    <MessageCircle className="h-4 w-4" /> Hablar con un asesor
                  </Button>
                </a>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
                {["Sin costos ocultos", "Panel de reseller incluido", "Soporte dedicado"].map((t) => (
                  <span key={t} className="flex items-center gap-1 text-xs text-slate-500">
                    <ShieldCheck className="h-3 w-3 text-green-500" /> {t}
                  </span>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══ FOOTER ═════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/10 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-8 sm:flex-row sm:justify-between sm:px-12 lg:px-16">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="Agente IA" className="h-7 max-w-[100px] object-contain" />
            ) : (
              <>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="font-semibold text-white">Agente IA</span>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} Agente IA. Todos los derechos reservados.</p>
          <div className="flex flex-wrap items-center gap-5 text-sm text-slate-500">
            <a href="#benefits" className="transition-colors hover:text-slate-300">Beneficios</a>
            <a href="#pricing" className="transition-colors hover:text-slate-300">Precios</a>
            <a href="#faq" className="transition-colors hover:text-slate-300">FAQ</a>
            <Link href="/inicio" className="transition-colors hover:text-slate-300">Ver producto</Link>
            <Link href="/login" className="transition-colors hover:text-slate-300">Acceso</Link>
            {instagram && <a href={instagram} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-pink-400">Instagram</a>}
            {facebook && <a href={facebook} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-blue-400">Facebook</a>}
          </div>
        </div>
      </footer>

      {/* ══ WHATSAPP FLOTANTE ══════════════════════════════════════════════ */}
      <a
        href={`https://wa.me/${(whatsappNumber ?? "573233612620").replace(/\D/g, "")}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Habla con nosotros"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 shadow-xl shadow-green-500/30 transition-all hover:scale-110 hover:bg-green-400"
      >
        <MessageCircle className="h-6 w-6 text-white" />
      </a>
    </div>
  );
}
