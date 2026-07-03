"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Bot,
  Menu,
  X,
  ArrowRight,
  ExternalLink,
  KeyRound,
  Webhook,
  ShieldCheck,
  Zap,
  ClipboardCheck,
  CheckCircle2,
  ChevronDown,
  Copy,
  AlertTriangle,
} from "lucide-react";
import { FaWhatsapp, FaFacebook, FaInstagram, FaMeta } from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const WEBHOOK_PATH = "/webhook/meta";

interface Props {
  whatsappNumber?: string | null;
  logoUrl?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  primaryColor?: string | null;
  meetingUrl?: string | null;
}

/* ─── Sub-componentes ─────────────────────────────────────────────── */

function WhatsAppButton({ number }: { number: string }) {
  const clean = number.replace(/\D/g, "");
  return (
    <a
      href={`https://wa.me/${clean}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30 transition-transform hover:scale-110"
      aria-label="Escríbenos por WhatsApp"
    >
      <FaWhatsapp className="h-7 w-7" />
    </a>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
          {n}
        </div>
        <div className="mt-1 w-px flex-1 bg-white/10" />
      </div>
      <div className="flex-1 pb-6">
        <p className="font-semibold leading-tight text-white">{title}</p>
        <div className="mt-1.5 space-y-2 text-sm text-slate-400">{children}</div>
      </div>
    </div>
  );
}

function CredChip({
  name,
  where,
  required,
}: {
  name: string;
  where: string;
  required?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
          {name}
          {required ? (
            <span className="rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              Requerido
            </span>
          ) : (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
              Opcional
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">{where}</p>
      </div>
    </div>
  );
}

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "El webhook no se verifica (“The callback URL couldn’t be validated”)",
    a: (
      <>
        Revisa que la URL termine en{" "}
        <span className="font-mono text-slate-300">{WEBHOOK_PATH}</span>, que el
        backend esté en línea con HTTPS válido, y que el{" "}
        <span className="font-medium text-slate-300">Verify Token</span> sea
        idéntico al configurado en el servidor. Meta hace una petición GET que
        debe devolver el{" "}
        <span className="font-mono text-slate-300">hub.challenge</span>.
      </>
    ),
  },
  {
    q: "Mi Access Token dejó de funcionar a las 24 horas",
    a: (
      <>
        El token que aparece en “Configuración de la API” es temporal. Genera un
        token permanente con un{" "}
        <span className="font-medium text-slate-300">Usuario del sistema</span>{" "}
        en Meta Business Suite y vuelve a guardarlo en la app.
      </>
    ),
  },
  {
    q: "No puedo enviar el primer mensaje / “fuera de la ventana de 24 h”",
    a: (
      <>
        WhatsApp solo permite mensajes libres dentro de las 24 h posteriores al
        último mensaje del cliente. Para iniciar una conversación fuera de esa
        ventana debes usar una{" "}
        <span className="font-medium text-slate-300">plantilla</span> aprobada
        por Meta.
      </>
    ),
  },
  {
    q: "Mi número no aparece / ya está en uso en WhatsApp",
    a: (
      <>
        Un número solo puede estar en la app normal de WhatsApp{" "}
        <span className="font-medium text-slate-300">o</span> en la Cloud API.
        Elimínalo de la app de WhatsApp Business antes de registrarlo, o usa el
        modo <span className="font-medium text-slate-300">Coexistencia</span>{" "}
        para mantener ambos.
      </>
    ),
  },
  {
    q: "¿Necesito verificar mi negocio?",
    a: (
      <>
        Sí para producción. Sin verificación de negocio y app en modo Live, solo
        podrás escribir a un número limitado de destinatarios de prueba.
      </>
    ),
  },
];

/* ─── Componente principal ────────────────────────────────────────── */

export function DocumentacionClient({
  whatsappNumber,
  logoUrl,
  instagram,
  facebook,
  primaryColor,
  meetingUrl,
}: Props) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tab, setTab] = useState<"whatsapp" | "facebook" | "instagram">(
    "whatsapp"
  );
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const brand = primaryColor?.trim() || "";

  const brandBtn = brand ? "" : "bg-blue-600 hover:bg-blue-500";
  const brandStyle = brand ? { backgroundColor: brand } : undefined;

  const copy = (value: string) => {
    navigator.clipboard.writeText(value);
  };

  const TABS = [
    { id: "whatsapp" as const, label: "WhatsApp", icon: <FaWhatsapp className="h-4 w-4 text-green-400" /> },
    { id: "facebook" as const, label: "Facebook", icon: <FaFacebook className="h-4 w-4 text-[#1877F2]" /> },
    { id: "instagram" as const, label: "Instagram", icon: <FaInstagram className="h-4 w-4 text-[#E4405F]" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* ══ NAVBAR ══════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 sm:px-12 lg:px-16">
          <Link href="/inicio" className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="Agente IA" className="h-8 max-w-[120px] object-contain" />
            ) : (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600" style={brandStyle}>
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-bold text-white">Agente IA</span>
              </>
            )}
          </Link>
          <nav className="hidden items-center gap-7 sm:flex">
            {[
              ["#pasos", "Pasos"],
              ["#credenciales", "Credenciales"],
              ["#webhook", "Webhook"],
              ["#faq", "FAQ"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="text-sm text-slate-400 transition-colors hover:text-white">
                {label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-slate-300 hover:bg-white/10 hover:text-white">
                Iniciar sesión
              </Button>
            </Link>
            <Link href="/completar-registro">
              <Button size="sm" className={cn("text-white", brandBtn)} style={brandStyle}>
                Comenzar gratis
              </Button>
            </Link>
          </div>
          <button className="p-2 text-slate-400 sm:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="space-y-3 border-t border-white/10 px-4 py-3 sm:hidden">
            {[
              ["#pasos", "Pasos"],
              ["#credenciales", "Credenciales"],
              ["#webhook", "Webhook"],
              ["#faq", "FAQ"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="block text-sm text-slate-300" onClick={() => setMobileMenuOpen(false)}>
                {label}
              </a>
            ))}
            <div className="flex gap-2 pt-1">
              <Link href="/login" className="flex-1">
                <Button variant="outline" size="sm" className="w-full border-white/20 bg-transparent text-white hover:bg-white/10">
                  Iniciar sesión
                </Button>
              </Link>
              <Link href="/completar-registro" className="flex-1">
                <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-500" style={brandStyle}>
                  Registrarse
                </Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-4xl px-6 sm:px-12 lg:px-16">
        {/* ══ HERO ═════════════════════════════════════════════════ */}
        <section className="relative py-12 text-center">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
          </div>
          <div className="relative">
            <Badge className="mb-4 inline-flex w-fit items-center gap-1.5 border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-blue-300">
              <FaMeta className="h-3.5 w-3.5" /> API oficial de Meta
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Conecta WhatsApp, Facebook e Instagram
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-slate-400 sm:text-lg">
              Guía paso a paso para obtener tus credenciales oficiales de Meta y
              conectar tus canales al Agente IA de Verzay.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/5 px-3 py-1 text-sm text-green-300">
                <FaWhatsapp className="h-3.5 w-3.5" /> WhatsApp Cloud API
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 px-3 py-1 text-sm text-blue-300">
                <FaFacebook className="h-3.5 w-3.5" /> Messenger
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-500/20 bg-pink-500/5 px-3 py-1 text-sm text-pink-300">
                <FaInstagram className="h-3.5 w-3.5" /> Instagram DM
              </span>
            </div>
          </div>
        </section>

        {/* ══ DOS CAMINOS ══════════════════════════════════════════ */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl border border-green-500/30 bg-white/5 p-6">
            <span className="absolute right-4 top-4 rounded-full bg-green-600 px-2.5 py-0.5 text-xs font-semibold text-white">
              Recomendado
            </span>
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <Zap className="h-5 w-5 text-green-400" /> Conexión automática
            </h3>
            <div className="mt-3 space-y-3 text-sm text-slate-400">
              <p>
                El camino más rápido. Con el botón{" "}
                <span className="font-medium text-white">“WhatsApp API”</span> o{" "}
                <span className="font-medium text-white">“Coexistencia API”</span>{" "}
                dentro de la app, Meta abre una ventana donde inicias sesión y
                autorizas tu cuenta.
              </p>
              <p>
                La app obtiene y guarda por ti el{" "}
                <span className="font-medium text-white">Access Token</span>, el{" "}
                <span className="font-medium text-white">Phone Number ID</span> y
                el <span className="font-medium text-white">WABA ID</span>. No
                necesitas copiar nada manualmente.
              </p>
              <Link href="/login">
                <Button size="sm" className={cn("mt-1 text-white", brandBtn)} style={brandStyle}>
                  Entrar y conectar <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <KeyRound className="h-5 w-5 text-amber-400" /> Credenciales manuales
            </h3>
            <div className="mt-3 space-y-3 text-sm text-slate-400">
              <p>
                Si prefieres (o necesitas) usar tu propia app de Meta, obtienes
                las credenciales en{" "}
                <span className="font-medium text-white">Meta for Developers</span>{" "}
                y las pegas en la app.
              </p>
              <p>
                Sigue los pasos de abajo. Al final las ingresas en{" "}
                <span className="font-medium text-white">
                  Conexión → “Ingresar credenciales manualmente”
                </span>
                .
              </p>
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="mt-1 border-white/20 bg-transparent text-white hover:bg-white/10">
                  Abrir Meta for Developers <ExternalLink className="ml-1 h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* ══ PRERREQUISITOS ═══════════════════════════════════════ */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <ClipboardCheck className="h-5 w-5 text-blue-400" /> Antes de empezar necesitas
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>
                Una cuenta en{" "}
                <a className="font-medium text-blue-400 hover:underline" href="https://business.facebook.com" target="_blank" rel="noopener noreferrer">
                  Meta Business Suite
                </a>{" "}
                (Administrador Comercial).
              </span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>
                Una cuenta de desarrollador en{" "}
                <a className="font-medium text-blue-400 hover:underline" href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer">
                  developers.facebook.com
                </a>
                .
              </span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>
                Para WhatsApp: un número de teléfono que{" "}
                <span className="font-medium text-slate-200">no esté</span>{" "}
                registrado en la app normal de WhatsApp (o listo para migrar a
                Coexistencia).
              </span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>
                Para Instagram: una cuenta{" "}
                <span className="font-medium text-slate-200">Profesional</span>{" "}
                (Empresa o Creador) vinculada a una Página de Facebook.
              </span>
            </li>
          </ul>
        </section>

        {/* ══ PASO 1: CREAR APP ════════════════════════════════════ */}
        <section id="pasos" className="mt-12 scroll-mt-20">
          <h2 className="mb-4 text-xl font-bold text-white">Paso 1 · Crea tu app en Meta</h2>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <Step n={1} title="Entra a Meta for Developers">
              <p>
                Ve a{" "}
                <a className="font-medium text-blue-400 hover:underline" href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">
                  developers.facebook.com/apps
                </a>{" "}
                y haz clic en <span className="font-medium text-slate-200">“Crear app”</span>.
              </p>
            </Step>
            <Step n={2} title="Elige el tipo de app">
              <p>
                Selecciona <span className="font-medium text-slate-200">“Empresa”</span> (Business)
                como caso de uso y vincúlala a tu Administrador Comercial.
              </p>
            </Step>
            <Step n={3} title="Agrega los productos que vas a usar">
              <p>
                En el panel de la app, agrega los productos según tus canales:{" "}
                <span className="font-medium text-slate-200">WhatsApp</span>,{" "}
                <span className="font-medium text-slate-200">Messenger</span> y/o{" "}
                <span className="font-medium text-slate-200">Instagram</span>.
              </p>
            </Step>
            <Step n={4} title="Obtén el App ID y el App Secret">
              <p>
                En <span className="font-medium text-slate-200">Configuración → Básico</span>{" "}
                encuentras el <span className="font-medium text-slate-200">App ID</span> y el{" "}
                <span className="font-medium text-slate-200">App Secret</span> (haz clic en
                “Mostrar”). Guárdalos; son las llaves maestras de tu app.
              </p>
            </Step>
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  5
                </div>
              </div>
              <div className="flex-1">
                <p className="font-semibold leading-tight text-white">
                  Modo producción y verificación del negocio
                </p>
                <p className="mt-1.5 text-sm text-slate-400">
                  Para atender clientes reales, tu app debe pasar a{" "}
                  <span className="font-medium text-slate-200">Live</span> y tu negocio debe estar{" "}
                  <span className="font-medium text-slate-200">verificado</span> por Meta. En modo
                  desarrollo solo puedes escribir a números de prueba.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ══ PASO 2: CREDENCIALES POR CANAL ═══════════════════════ */}
        <section id="credenciales" className="mt-12 scroll-mt-20">
          <h2 className="mb-4 text-xl font-bold text-white">Paso 2 · Credenciales por canal</h2>

          <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                )}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            {tab === "whatsapp" && (
              <div className="space-y-5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <CredChip name="Phone Number ID" where="WhatsApp → Configuración de la API" required />
                  <CredChip name="Access Token" where="WhatsApp → Configuración de la API (o usuario del sistema)" required />
                  <CredChip name="WABA ID" where="WhatsApp → Configuración de la API" />
                  <CredChip name="Verify Token" where="Lo defines tú (string aleatorio)" />
                </div>
                <div>
                  <Step n={1} title="Abre la Configuración de la API">
                    <p>
                      En el producto{" "}
                      <span className="font-medium text-slate-200">WhatsApp → Configuración de la API</span>{" "}
                      verás una tarjeta con tu número de prueba y los IDs.
                    </p>
                  </Step>
                  <Step n={2} title="Copia el Phone Number ID y el WABA ID">
                    <p>
                      Debajo del selector de número aparecen el{" "}
                      <span className="font-medium text-slate-200">Identificador del número de teléfono</span>{" "}
                      (Phone Number ID) y el{" "}
                      <span className="font-medium text-slate-200">Identificador de la cuenta de WhatsApp Business</span>{" "}
                      (WABA ID).
                    </p>
                  </Step>
                  <Step n={3} title="Genera un Access Token permanente">
                    <p>
                      El token temporal de esa pantalla dura{" "}
                      <span className="font-medium text-slate-200">24 horas</span>. Para producción crea un{" "}
                      <span className="font-medium text-slate-200">Usuario del sistema</span> en Meta Business
                      Suite, asígnale la app y la WABA con permiso{" "}
                      <span className="font-mono text-xs text-slate-300">whatsapp_business_messaging</span> y
                      genera un token sin expiración.
                    </p>
                  </Step>
                  <Step n={4} title="Registra tu número real">
                    <p>
                      Agrega y verifica tu número en{" "}
                      <span className="font-medium text-slate-200">WhatsApp → Números de teléfono</span>{" "}
                      (recibes un código por SMS/llamada). Ese es el número con el que atenderás a tus
                      clientes.
                    </p>
                  </Step>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                  <p className="text-sm text-slate-300">
                    <span className="font-semibold text-white">Coexistencia:</span> si quieres seguir usando la
                    app de WhatsApp Business en tu teléfono <span className="font-medium">y</span> el Agente IA a
                    la vez, usa el botón <span className="font-medium">“Coexistencia API”</span> (conexión
                    automática).
                  </p>
                </div>
              </div>
            )}

            {tab === "facebook" && (
              <div className="space-y-5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <CredChip name="Page ID" where="Tu Página de Facebook → Información" required />
                  <CredChip name="Page Access Token" where="Messenger → Configuración de la API" required />
                  <CredChip name="Verify Token" where="Lo defines tú (string aleatorio)" />
                </div>
                <div>
                  <Step n={1} title="Agrega el producto Messenger">
                    <p>
                      En tu app, agrega{" "}
                      <span className="font-medium text-slate-200">Messenger</span> y ve a su{" "}
                      <span className="font-medium text-slate-200">Configuración de la API</span>.
                    </p>
                  </Step>
                  <Step n={2} title="Vincula tu Página de Facebook">
                    <p>
                      En <span className="font-medium text-slate-200">Generar tokens de acceso</span> conecta la
                      Página desde la que quieres responder los mensajes de Messenger.
                    </p>
                  </Step>
                  <Step n={3} title="Copia el Page ID y el Page Access Token">
                    <p>
                      El <span className="font-medium text-slate-200">Page ID</span> está en la información de
                      tu Página; el <span className="font-medium text-slate-200">Page Access Token</span> se
                      genera en esa misma pantalla de Messenger.
                    </p>
                  </Step>
                </div>
              </div>
            )}

            {tab === "instagram" && (
              <div className="space-y-5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <CredChip name="Instagram Account ID" where="Vinculado a tu Página de Facebook" required />
                  <CredChip name="Access Token" where="Con permisos de Instagram Messaging" required />
                  <CredChip name="Verify Token" where="Lo defines tú (string aleatorio)" />
                </div>
                <div>
                  <Step n={1} title="Convierte tu Instagram a Profesional">
                    <p>
                      En la app de Instagram: Configuración → Cuenta → cambia a{" "}
                      <span className="font-medium text-slate-200">cuenta Profesional</span> (Empresa o
                      Creador).
                    </p>
                  </Step>
                  <Step n={2} title="Vincula Instagram con una Página de Facebook">
                    <p>
                      Desde Meta Business Suite, conecta tu cuenta de Instagram a la Página de Facebook. Los DMs
                      de Instagram usan la misma infraestructura de Messenger.
                    </p>
                  </Step>
                  <Step n={3} title="Agrega el producto Instagram y genera el token">
                    <p>
                      Agrega <span className="font-medium text-slate-200">Instagram</span> en tu app y genera un
                      token con permisos{" "}
                      <span className="font-mono text-xs text-slate-300">instagram_basic</span> e{" "}
                      <span className="font-mono text-xs text-slate-300">instagram_manage_messages</span>. Copia
                      el <span className="font-medium text-slate-200">Instagram Account ID</span>.
                    </p>
                  </Step>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ══ PASO 3: WEBHOOK ══════════════════════════════════════ */}
        <section id="webhook" className="mt-12 scroll-mt-20">
          <h2 className="mb-4 text-xl font-bold text-white">Paso 3 · Configura el Webhook</h2>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <Webhook className="h-5 w-5 text-violet-400" /> Conecta Meta con Verzay
            </h3>
            <p className="mt-3 text-sm text-slate-400">
              El webhook es lo que permite que Meta te{" "}
              <span className="font-medium text-slate-200">envíe</span> los mensajes entrantes. Sin él, el
              Agente IA no recibe nada.
            </p>

            <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                URL de devolución de llamada (Callback URL)
              </p>
              <p className="mt-1 text-sm text-slate-300">
                La URL de tu backend terminada en{" "}
                <button
                  onClick={() => copy(WEBHOOK_PATH)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-xs text-white hover:bg-white/10"
                  title="Copiar"
                >
                  {WEBHOOK_PATH} <Copy className="h-3 w-3" />
                </button>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Ej: <span className="font-mono">https://api.tu-dominio.com{WEBHOOK_PATH}</span>
              </p>
            </div>

            <div className="mt-4">
              <Step n={1} title="Define un Verify Token">
                <p>
                  Inventa un <span className="font-medium text-slate-200">string aleatorio</span> (por ejemplo{" "}
                  <span className="font-mono text-xs text-slate-300">verzay_9f3k2p</span>). Debe coincidir con
                  el configurado en el servidor.
                </p>
              </Step>
              <Step n={2} title="Registra el webhook en Meta">
                <p>
                  En el producto (WhatsApp / Messenger / Instagram) →{" "}
                  <span className="font-medium text-slate-200">Configuración → Webhooks</span>, pega la Callback
                  URL y el Verify Token. Meta hará una verificación automática y debe responder “Verificado”.
                </p>
              </Step>
              <Step n={3} title="Suscríbete a los campos de mensajes">
                <p>
                  Suscribe al menos el campo{" "}
                  <span className="font-mono text-xs text-slate-300">messages</span> para recibir los mensajes
                  entrantes de tus clientes.
                </p>
              </Step>
            </div>

            <div className="mt-2 flex items-start gap-3 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
              <p className="text-sm text-slate-300">
                <span className="font-semibold text-white">Con conexión automática esto es automático.</span> Si
                conectas con los botones “WhatsApp API” o “Coexistencia API”, la suscripción del webhook se hace
                sola. Este paso solo aplica si usas tu propia app de Meta con credenciales manuales.
              </p>
            </div>
          </div>
        </section>

        {/* ══ PASO 4: PEGAR EN LA APP ══════════════════════════════ */}
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold text-white">Paso 4 · Pega tus credenciales en Verzay</h2>
          <div className="rounded-2xl border border-blue-500/30 bg-white/5 p-6">
            <p className="text-sm text-slate-400">
              Inicia sesión, ve a <span className="font-medium text-white">Conexión</span> y en la tarjeta de{" "}
              <span className="font-medium text-white">WhatsApp Cloud API</span> haz clic en{" "}
              <span className="font-medium text-white">“Ingresar credenciales manualmente”</span>. Completa:
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                "Phone Number ID (requerido)",
                "Access Token (requerido)",
                "WABA ID (opcional)",
                "Verify Token (opcional)",
              ].map((t) => (
                <div key={t} className="flex items-center gap-2 text-sm text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-green-500" /> {t}
                </div>
              ))}
            </div>
            <Link href="/login">
              <Button className={cn("mt-4 text-white", brandBtn)} style={brandStyle}>
                Iniciar sesión y conectar <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* ══ FAQ ══════════════════════════════════════════════════ */}
        <section id="faq" className="mt-12 scroll-mt-20">
          <h2 className="mb-4 text-xl font-bold text-white">Preguntas frecuentes</h2>
          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium text-white"
                >
                  {faq.q}
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", openFaq === i && "rotate-180")} />
                </button>
                {openFaq === i && <div className="px-5 pb-4 text-sm text-slate-400">{faq.a}</div>}
              </div>
            ))}
          </div>
        </section>

        {/* ══ CTA FINAL ════════════════════════════════════════════ */}
        <section className="my-12">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <p className="max-w-md text-sm text-slate-400">
              ¿Te trabaste en algún paso? Lo más sencillo es usar la{" "}
              <span className="font-medium text-white">conexión automática</span>, que hace casi todo esto por
              ti.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/completar-registro">
                <Button className={cn("text-white", brandBtn)} style={brandStyle}>
                  Comenzar gratis <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
              {meetingUrl && (
                <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
                    Agendar asesoría
                  </Button>
                </a>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ══ FOOTER ═══════════════════════════════════════════════════ */}
      <footer className="border-t border-white/10 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 sm:flex-row sm:justify-between sm:px-12 lg:px-16">
          <Link href="/inicio" className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="Agente IA" className="h-7 max-w-[100px] object-contain" />
            ) : (
              <>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600" style={brandStyle}>
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="font-semibold text-white">Agente IA</span>
              </>
            )}
          </Link>
          <div className="flex flex-wrap items-center gap-5 text-sm text-slate-500">
            <Link href="/inicio" className="transition-colors hover:text-slate-300">Inicio</Link>
            <a href="#faq" className="transition-colors hover:text-slate-300">FAQ</a>
            {instagram && <a href={instagram} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-pink-400">Instagram</a>}
            {facebook && <a href={facebook} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-blue-400">Facebook</a>}
            <Link href="/login" className="transition-colors hover:text-slate-300">Acceso</Link>
          </div>
        </div>
      </footer>

      <WhatsAppButton number={whatsappNumber ?? "573233612620"} />
    </div>
  );
}
