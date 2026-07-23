"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getAgentOnboardingState,
  dismissAgentOnboarding,
  completeAgentOnboarding,
} from "@/actions/agent-onboarding-actions";

/**
 * Asistente de primer arranque (5 pasos). Aparece cuando el dueño entra por
 * primera vez y su Agente IA aún no está configurado. Guía: negocio → objetivo →
 * camino del cliente → contenido (preguntas/productos/pagos/gestión) → revisar.
 * Guarda TODO en las mismas secciones que el editor (ver completeAgentOnboarding).
 */

type Objective = { id: string; em: string; title: string; desc: string; steps: { t: string; ex: string }[] };

const OBJECTIVES: Objective[] = [
  {
    id: "venta-directa", em: "⚡", title: "Venta Directa", desc: "5 fases: ventas rápidas con foco en cerrar.",
    steps: [
      { t: "Bienvenida", ex: "¡Hola! 👋 Gracias por escribir a [tu negocio]. ¿Qué te interesa?" },
      { t: "Producto de interés", ex: "¿Qué producto o servicio buscas? Te doy los detalles." },
      { t: "Presentación", ex: "Te muestro las opciones, precios y beneficios." },
      { t: "Cierre", ex: "¿Te lo aparto? Para cerrar necesito tu nombre y forma de pago." },
      { t: "Finalización", ex: "¡Gracias por tu compra! Cualquier duda, escríbeme por aquí." },
    ],
  },
  {
    id: "venta-consultiva", em: "🎯", title: "Venta Consultiva", desc: "5 fases: conexión, diagnóstico, propuesta y cierre.",
    steps: [
      { t: "Bienvenida", ex: "¡Hola! Soy el asistente de [tu negocio]. ¿En qué puedo ayudarte hoy?" },
      { t: "Pregunta 1", ex: "Para orientarte mejor, ¿qué estás buscando resolver?" },
      { t: "Pregunta 2", ex: "¿Y para cuándo lo necesitas o qué presupuesto manejas?" },
      { t: "Presentación", ex: "Según lo que me cuentas, esto es lo que te recomiendo…" },
      { t: "Finalización", ex: "¿Agendamos una cita? Déjame tu nombre y correo y coordinamos." },
    ],
  },
  {
    id: "agendamiento-citas", em: "📅", title: "Agendar citas", desc: "5 fases: ofrece horarios y reserva la cita.",
    steps: [
      { t: "Bienvenida", ex: "¡Hola! Con gusto te agendo. ¿Qué servicio necesitas?" },
      { t: "Servicio", ex: "¿Cuál de nuestros servicios quieres reservar?" },
      { t: "Disponibilidad", ex: "Tengo estos horarios disponibles: [días/horas]. ¿Cuál te viene bien?" },
      { t: "Confirmación", ex: "Listo, te agendo para [fecha/hora]. ¿Me confirmas tu nombre?" },
      { t: "Finalización", ex: "¡Cita confirmada! Te esperamos en [dirección]. Cualquier cambio, escríbeme." },
    ],
  },
  {
    id: "calificacion-leads", em: "🧲", title: "Calificar leads", desc: "5 fases: detecta quién está listo para comprar.",
    steps: [
      { t: "Bienvenida", ex: "¡Hola! Gracias por tu interés. ¿Me cuentas qué buscas?" },
      { t: "Calificación", ex: "¿Es para uso personal o para tu empresa?" },
      { t: "Urgencia", ex: "¿Para cuándo lo necesitas?" },
      { t: "Presupuesto", ex: "¿Tienes un presupuesto estimado en mente?" },
      { t: "Derivar a asesor", ex: "Te paso con un asesor que resolverá todo. ¿Tu nombre y correo?" },
    ],
  },
  {
    id: "atencion-cliente", em: "🎧", title: "Atención / soporte", desc: "5 fases: resuelve dudas, solicitudes y reclamos.",
    steps: [
      { t: "Bienvenida", ex: "¡Hola! Soy soporte de [tu negocio]. ¿En qué te ayudo?" },
      { t: "Identificación", ex: "Para ubicar tu caso, ¿me das tu nombre o número de pedido?" },
      { t: "Validación", ex: "Déjame revisar… un momento por favor." },
      { t: "Resolución", ex: "Esto es lo que encontré / así lo solucionamos: […]" },
      { t: "Cierre", ex: "¿Quedó resuelto? ¿Algo más en lo que pueda ayudarte?" },
    ],
  },
  {
    id: "pedidos-delivery", em: "🛵", title: "Pedidos / Delivery", desc: "5 fases: arma el pedido, entrega y cobra.",
    steps: [
      { t: "Bienvenida", ex: "¡Hola! ¿Qué te gustaría pedir hoy?" },
      { t: "Pedido", ex: "Anoto tu pedido. ¿Deseas agregar algo más?" },
      { t: "Datos de entrega", ex: "¿A qué dirección o zona lo enviamos? Así calculo el envío." },
      { t: "Resumen", ex: "Tu pedido: […]. Productos [monto] + envío [monto] = Total [monto]. ¿Confirmas?" },
      { t: "Pago", ex: "Para confirmar, ¿cómo prefieres pagar? [contra entrega / transferencia…]" },
    ],
  },
];

const STEP_TITLES = ["Tu negocio", "Objetivo del agente", "Camino del cliente", "Preguntas y productos", "Revisar y activar"];
const GEST = ["Solicitudes", "Pedidos", "Reclamos", "Reservas", "Citas"] as const;
const PAYOPTS = ["Efectivo", "Transferencia", "Tarjeta", "PayPal", "Mercado Pago"];
const BIZ_REQUIRED = ["nombre", "sector", "ofrece", "ubicacion", "horario", "telefono", "sitio"] as const;
const DRAFT_KEY = "agent-onboarding-draft-v1";

type Biz = { nombre: string; sector: string; ofrece: string; ubicacion: string; horario: string; telefono: string; sitio: string; notas: string };
type Gestion = Record<string, { on: boolean; campos: string[] }>;
type Form = {
  step: number;
  biz: Biz;
  objectiveId: string;
  msgs: Record<string, string[]>;
  extra: Record<string, { title: string; msg: string }[]>;
  faq: { q: string; a: string }[];
  products: { name: string; desc: string }[];
  pagos: string;
  extras: string;
  gestion: Gestion;
};

const emptyGestion = (): Gestion =>
  GEST.reduce((acc, k) => ((acc[k] = { on: false, campos: [] }), acc), {} as Gestion);

const initialForm = (): Form => ({
  step: 0,
  biz: { nombre: "", sector: "", ofrece: "", ubicacion: "", horario: "", telefono: "", sitio: "", notas: "" },
  objectiveId: "venta-consultiva",
  msgs: {},
  extra: {},
  faq: [{ q: "", a: "" }],
  products: [{ name: "", desc: "" }],
  pagos: "",
  extras: "",
  gestion: emptyGestion(),
});

// ── estilos base (Tailwind) ─────────────────────────────────
const input = "w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-background";
const label = "mb-1 block text-xs font-semibold";
const pill = "rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors";
const addBtn = "rounded-lg border border-dashed border-primary/50 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5";

function flash(el: HTMLElement | null) {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.style.transition = "box-shadow .2s, border-color .2s";
  el.style.boxShadow = "0 0 0 3px rgba(220,38,38,.35)";
  el.style.borderColor = "#dc2626";
  setTimeout(() => { try { (el as HTMLInputElement).focus({ preventScroll: true }); } catch { /* noop */ } }, 300);
  setTimeout(() => { el.style.boxShadow = ""; el.style.borderColor = ""; }, 1500);
}

export function AgentOnboardingWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);
  const [form, setForm] = useState<Form>(initialForm);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const setBiz = (k: keyof Biz, v: string) => setForm((f) => ({ ...f, biz: { ...f.biz, [k]: v } }));

  const obj = useMemo(() => OBJECTIVES.find((o) => o.id === form.objectiveId) ?? OBJECTIVES[1], [form.objectiveId]);
  const curMsgs = form.msgs[form.objectiveId] ?? [];
  const curExtra = form.extra[form.objectiveId] ?? [];

  const setMsg = (i: number, v: string) =>
    setForm((f) => {
      const arr = [...(f.msgs[f.objectiveId] ?? [])];
      arr[i] = v;
      return { ...f, msgs: { ...f.msgs, [f.objectiveId]: arr } };
    });
  const setExtra = (next: { title: string; msg: string }[]) =>
    setForm((f) => ({ ...f, extra: { ...f.extra, [f.objectiveId]: next } }));

  // Abrir automáticamente en primer arranque, o por evento (relanzar).
  useEffect(() => {
    let cancel = false;
    getAgentOnboardingState().then((s) => { if (!cancel && s.show) setOpen(true); }).catch(() => {});
    const openOnDemand = () => setOpen(true);
    window.addEventListener("agent-onboarding:open", openOnDemand);
    return () => { cancel = true; window.removeEventListener("agent-onboarding:open", openOnDemand); };
  }, []);

  // Auto-guardado: cargar borrador al abrir.
  useEffect(() => {
    if (!open || loaded) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setForm((f) => ({ ...f, ...saved, step: Math.min(4, Math.max(0, saved.step ?? 0)) }));
      }
    } catch { /* noop */ }
    setLoaded(true);
  }, [open, loaded]);

  // Auto-guardado: persistir cambios.
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* noop */ }
  }, [form, loaded]);

  if (!open) return null;

  const LAST = STEP_TITLES.length - 1;

  // ── validación ──
  const step1Valid = () => BIZ_REQUIRED.every((k) => form.biz[k].trim().length > 0);
  const step3Valid = () =>
    obj.steps.every((_, i) => (curMsgs[i] ?? "").trim().length > 0) &&
    curExtra.every((s) => s.title.trim() && s.msg.trim());
  const faqOk = form.faq.some((x) => x.q.trim() && x.a.trim());
  const prodOk = form.products.some((x) => x.name.trim());
  const payOk = form.pagos.trim().length > 0;
  const step4Valid = () => payOk && faqOk && prodOk;
  const stepValid = () => (form.step === 0 ? step1Valid() : form.step === 2 ? step3Valid() : form.step === 3 ? step4Valid() : true);

  const firstMissingId = (): string | null => {
    if (form.step === 0) {
      for (const k of BIZ_REQUIRED) if (!form.biz[k].trim()) return `onb-f-${k}`;
    } else if (form.step === 2) {
      for (let i = 0; i < obj.steps.length; i++) if (!(curMsgs[i] ?? "").trim()) return `onb-m-${i}`;
      for (let i = 0; i < curExtra.length; i++) {
        if (!curExtra[i].title.trim()) return `onb-ext-t-${i}`;
        if (!curExtra[i].msg.trim()) return `onb-ext-m-${i}`;
      }
    } else if (form.step === 3) {
      if (!faqOk) return "onb-faq-q-0";
      if (!prodOk) return "onb-prod-n-0";
      if (!payOk) return "onb-payinput";
    }
    return null;
  };

  const go = (d: number) => {
    if (d === 1 && !stepValid()) {
      const id = firstMissingId();
      if (id) flash(document.getElementById(id) as HTMLElement);
      return;
    }
    if (form.step === LAST && d === 1) { void publish(); return; }
    patch({ step: Math.max(0, Math.min(LAST, form.step + d)) });
    document.getElementById("onb-body")?.scrollTo({ top: 0 });
  };
  const goTo = (i: number) => patch({ step: Math.max(0, Math.min(LAST, i)) });

  const skip = async () => { setOpen(false); await dismissAgentOnboarding().catch(() => {}); };

  const publish = async () => {
    setSaving(true);
    const steps = [
      ...obj.steps.map((s, i) => ({ title: s.t, message: curMsgs[i] ?? "" })),
      ...curExtra.map((s) => ({ title: s.title, message: s.msg })),
    ];
    const res = await completeAgentOnboarding({
      business: { ...form.biz },
      objectiveId: form.objectiveId,
      steps,
      faq: form.faq.filter((f) => f.q.trim()),
      products: form.products.filter((p) => p.name.trim()),
      pagos: form.pagos,
      extras: form.extras,
      gestion: GEST.filter((k) => form.gestion[k].on).map((k) => ({ tipo: k, campos: form.gestion[k].campos })),
    });
    setSaving(false);
    if (res.ok) {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
      setPublished(true);
    } else {
      toast.error(res.error || "No se pudo dar de alta el agente.");
    }
  };

  // ── pago (chips + personalizados) ──
  const paySelected = () => form.pagos.split(",").map((s) => s.trim()).filter(Boolean);
  const payHas = (p: string) => paySelected().includes(p);
  const paySet = (arr: string[]) => patch({ pagos: arr.join(", ") });
  const payToggle = (p: string) => (payHas(p) ? paySet(paySelected().filter((x) => x !== p)) : paySet([...paySelected(), p]));
  const payAddCustom = () => {
    const el = document.getElementById("onb-payinput") as HTMLInputElement | null;
    if (!el) return;
    const set = paySelected();
    el.value.split(",").map((s) => s.trim()).filter(Boolean).forEach((x) => { if (!set.includes(x)) set.push(x); });
    paySet(set);
    el.value = "";
  };

  const objCustomCount = (m: string[]) => obj.steps.filter((_, i) => (m[i] ?? "").trim()).length;

  // ─────────────────────────── render ───────────────────────────
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 sm:p-6">
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-primary text-lg font-extrabold italic text-primary-foreground">V</div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">Da de alta tu Agente IA</h2>
            <p className="text-xs text-muted-foreground">Configúralo en unos pasos. Podrás ajustarlo cuando quieras.</p>
            {!published && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600">✓ Se guarda automáticamente</span>
            )}
          </div>
          {!published && (
            <button type="button" onClick={skip} className="ml-auto flex-none rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground">Hacerlo después</button>
          )}
        </div>

        {published ? (
          <SuccessScreen onConnect={() => router.push("/connection")} onLater={() => { setOpen(false); router.push("/ia"); }} />
        ) : (
          <>
            {/* Progress */}
            <div className="flex items-center gap-3 px-5 pt-4 sm:px-6">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${((form.step + 1) / STEP_TITLES.length) * 100}%` }} />
              </div>
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">Paso {form.step + 1} de {STEP_TITLES.length}</span>
            </div>

            {/* Body */}
            <div id="onb-body" className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-primary">Paso {form.step + 1} · {STEP_TITLES[form.step]}</p>

              {form.step === 0 && <StepBusiness biz={form.biz} setBiz={setBiz} />}
              {form.step === 1 && (
                <>
                  <p className="mb-3 text-sm text-muted-foreground">¿Qué debe hacer el agente principalmente?</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {OBJECTIVES.map((o) => (
                      <button key={o.id} type="button" onClick={() => patch({ objectiveId: o.id })}
                        className={`relative rounded-xl border p-3 text-left transition-all ${o.id === form.objectiveId ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary/60"}`}>
                        <div className="text-xl">{o.em}</div>
                        <div className="mt-1.5 text-sm font-bold">{o.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{o.desc}</div>
                        {o.id === form.objectiveId && <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-xs text-primary-foreground">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {form.step === 2 && (
                <StepPath obj={obj} msgs={curMsgs} setMsg={setMsg} extra={curExtra} setExtra={setExtra} />
              )}
              {form.step === 3 && (
                <StepContent
                  form={form} patch={patch}
                  payOpts={PAYOPTS} paySelected={paySelected()} payHas={payHas} payToggle={payToggle} payAddCustom={payAddCustom}
                  faqOk={faqOk} prodOk={prodOk}
                />
              )}
              {form.step === 4 && (
                <StepReview form={form} obj={obj} msgs={curMsgs} extra={curExtra} goTo={goTo} customCount={objCustomCount(curMsgs)} />
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 border-t border-border bg-muted/30 px-5 py-3.5 sm:px-6">
              <button type="button" disabled={form.step === 0} onClick={() => go(-1)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40">← Atrás</button>
              <div className="ml-auto flex items-center gap-3">
                {!stepValid() && <span className="max-w-[160px] text-right text-[11px] text-muted-foreground sm:text-xs">Completa lo obligatorio para continuar</span>}
                <button type="button" disabled={saving} onClick={() => go(1)}
                  className={`rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 ${form.step === LAST ? "bg-emerald-600 hover:bg-emerald-700" : "bg-primary hover:opacity-90"}`}>
                  {form.step === LAST ? (saving ? "Activando…" : "✦ Publicar agente") : "Siguiente →"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────── Paso 1: negocio ───────────────────
function StepBusiness({ biz, setBiz }: { biz: Biz; setBiz: (k: keyof Biz, v: string) => void }) {
  const F = (k: keyof Biz, ph?: string) => (
    <input id={`onb-f-${k}`} className={input} value={biz[k]} placeholder={ph} onChange={(e) => setBiz(k, e.target.value)} />
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Todos los campos son obligatorios, excepto <b>Notas</b>.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className={label}>Nombre del negocio</span>{F("nombre", "Ej. Clínica Sofía")}</label>
        <label className="block"><span className={label}>Rubro / industria</span>{F("sector", "Ej. Salud y estética")}</label>
      </div>
      <label className="block"><span className={label}>¿Qué ofreces? — en una frase</span>{F("ofrece", "Ej. Tratamientos dentales con cita previa")}</label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className={label}>Ubicación / Dirección</span>{F("ubicacion", "Ej. Cali, Colombia")}</label>
        <label className="block"><span className={label}>Horarios de atención</span>{F("horario", "Ej. Lun a Sáb, 9:00–19:00")}</label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className={label}>Número de contacto</span>{F("telefono", "Ej. 57 3233612620")}</label>
        <label className="block"><span className={label}>Sitio web o red social</span>{F("sitio", "Ej. tunegocio.com o instagram.com/tunegocio")}</label>
      </div>
      <label className="block">
        <span className={label}>Notas / Instrucciones extra <span className="font-normal text-muted-foreground">— opcional</span></span>
        <textarea className={`${input} min-h-[70px]`} value={biz.notas} placeholder="Ej. Trata siempre de 'usted'. No dar precios sin confirmar disponibilidad." onChange={(e) => setBiz("notas", e.target.value)} />
      </label>
    </div>
  );
}

// ─────────────────── Paso 3: camino ───────────────────
function StepPath({ obj, msgs, setMsg, extra, setExtra }: {
  obj: Objective; msgs: string[]; setMsg: (i: number, v: string) => void;
  extra: { title: string; msg: string }[]; setExtra: (n: { title: string; msg: string }[]) => void;
}) {
  return (
    <div>
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold text-violet-500">✦ Generado según tu objetivo ({obj.title})</div>
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs text-foreground">
        <span>💡</span>
        <p>Cada paso ya trae la <b>lógica lista</b>. Escribe <b>qué debe decir el agente</b> en cada momento. <b>Todos los pasos son obligatorios</b>.</p>
      </div>
      <div className="space-y-2.5">
        {obj.steps.map((s, i) => {
          const val = msgs[i] ?? "";
          const filled = val.trim().length > 0;
          return (
            <div key={i} className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full border-2 border-primary text-xs font-bold text-primary tabular-nums">{i + 1}</span>
                <span className="text-sm font-medium">{s.t}</span>
                <span className="ml-auto text-[11px] font-semibold">{filled ? <span className="text-emerald-600">✓ listo</span> : <span className="text-red-600">obligatorio</span>}</span>
              </div>
              <textarea id={`onb-m-${i}`} className={`${input} mt-2.5 min-h-[64px] bg-background`} value={val} placeholder={`Ej. ${s.ex}`} onChange={(e) => setMsg(i, e.target.value)} />
              {!filled && (
                <button type="button" onClick={() => setMsg(i, s.ex)} className="mt-2 text-xs font-semibold text-primary hover:underline">✨ Usar este ejemplo</button>
              )}
            </div>
          );
        })}
        {extra.map((s, i) => (
          <div key={`x${i}`} className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full border-2 border-primary text-xs font-bold text-primary tabular-nums">{obj.steps.length + i + 1}</span>
              <input id={`onb-ext-t-${i}`} className={`${input} flex-1`} value={s.title} placeholder="Nombre del paso (ej. Seguimiento)" onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <button type="button" onClick={() => setExtra(extra.filter((_, j) => j !== i))} className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-border text-muted-foreground hover:border-red-500 hover:text-red-600">✕</button>
            </div>
            <textarea id={`onb-ext-m-${i}`} className={`${input} mt-2.5 min-h-[64px] bg-background`} value={s.msg} placeholder="¿Qué debe decir el agente en este paso?" onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, msg: e.target.value } : x)))} />
          </div>
        ))}
      </div>
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Cada paso define una etapa <b className="text-primary">→</b> de la conversación</span>
        <button type="button" onClick={() => setExtra([...extra, { title: "", msg: "" }])} className="rounded-lg border border-primary/45 bg-primary/5 px-3.5 py-2 text-xs font-semibold text-primary hover:bg-primary/10">+ Agregar paso</button>
      </div>
    </div>
  );
}

// ─────────────────── Paso 4: contenido ───────────────────
function StepContent({ form, patch, payOpts, paySelected, payHas, payToggle, payAddCustom, faqOk, prodOk }: {
  form: Form; patch: (p: Partial<Form>) => void;
  payOpts: string[]; paySelected: string[]; payHas: (p: string) => boolean; payToggle: (p: string) => void; payAddCustom: () => void;
  faqOk: boolean; prodOk: boolean;
}) {
  const oblig = <span className="ml-2 text-[11px] font-semibold text-red-600/80">Obligatorio</span>;
  const setFaq = (n: { q: string; a: string }[]) => patch({ faq: n });
  const setProd = (n: { name: string; desc: string }[]) => patch({ products: n });
  const setGest = (k: string, v: { on: boolean; campos: string[] }) => patch({ gestion: { ...form.gestion, [k]: v } });
  const customs = paySelected.filter((p) => !payOpts.includes(p));

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground"><b>Preguntas, Productos y Medios de pago</b> son obligatorios. Extras y Gestión son opcionales.</p>

      {/* Preguntas */}
      <section>
        <h3 className="mb-2 text-sm font-bold">❓ Preguntas frecuentes{oblig}</h3>
        <div className="space-y-2">
          {form.faq.map((it, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input id={`onb-faq-q-${i}`} className={input} value={it.q} placeholder="Pregunta (ej. ¿Hacen domicilios?)" onChange={(e) => setFaq(form.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
              <input className={input} value={it.a} placeholder="Respuesta (ej. Sí, en toda la ciudad)" onChange={(e) => setFaq(form.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
              <button type="button" onClick={() => setFaq(form.faq.filter((_, j) => j !== i))} className="justify-self-end grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:border-red-500 hover:text-red-600">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setFaq([...form.faq, { q: "", a: "" }])} className={`mt-2 ${addBtn}`}>+ Agregar pregunta</button>
        {!faqOk && <p className="mt-1.5 text-xs italic text-red-600">Agrega al menos una pregunta con su respuesta.</p>}
      </section>

      {/* Productos */}
      <section>
        <h3 className="mb-2 text-sm font-bold">🛍️ Productos / Servicios{oblig}</h3>
        <div className="space-y-2">
          {form.products.map((it, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input id={`onb-prod-n-${i}`} className={input} value={it.name} placeholder="Nombre (ej. Limpieza dental)" onChange={(e) => setProd(form.products.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input className={input} value={it.desc} placeholder="Descripción / precio (ej. Desde $80.000)" onChange={(e) => setProd(form.products.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))} />
              <button type="button" onClick={() => setProd(form.products.filter((_, j) => j !== i))} className="justify-self-end grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:border-red-500 hover:text-red-600">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setProd([...form.products, { name: "", desc: "" }])} className={`mt-2 ${addBtn}`}>+ Agregar producto / servicio</button>
        {!prodOk && <p className="mt-1.5 text-xs italic text-red-600">Agrega al menos un producto o servicio.</p>}
      </section>

      {/* Medios de pago */}
      <section>
        <h3 className="mb-2 text-sm font-bold">💳 Medios de pago{oblig}</h3>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Toca los que aceptas, o agrega el tuyo</p>
        <div className="mb-2.5 flex flex-wrap gap-2">
          {payOpts.map((p) => (
            <button key={p} type="button" onClick={() => payToggle(p)} className={`${pill} ${payHas(p) ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground"}`}>{payHas(p) ? "✓ " : ""}{p}</button>
          ))}
          {customs.map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {p}<button type="button" onClick={() => payToggle(p)} className="opacity-70 hover:opacity-100">✕</button>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input id="onb-payinput" className={input} placeholder="Agrega otro (ej. billetera digital: Nequi, Yape, Zelle…)" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); payAddCustom(); } }} />
          <button type="button" onClick={payAddCustom} className={addBtn}>+ Agregar</button>
        </div>
      </section>

      {/* Extras */}
      <section>
        <h3 className="mb-2 text-sm font-bold">✨ Extras / Información adicional</h3>
        <textarea className={`${input} min-h-[70px]`} value={form.extras} placeholder="Ej. Promociones vigentes, políticas de garantía, parqueadero disponible…" onChange={(e) => patch({ extras: e.target.value })} />
      </section>

      {/* Gestión */}
      <section>
        <h3 className="mb-2 text-sm font-bold">🗂️ Gestión — ¿qué debe registrar el agente?</h3>
        <div className="flex flex-wrap gap-2">
          {GEST.map((k) => {
            const on = form.gestion[k].on;
            return (
              <button key={k} type="button" onClick={() => setGest(k, { ...form.gestion[k], on: !on })} className={`${pill} ${on ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground"}`}>{on ? "✓ " : ""}{k}</button>
            );
          })}
        </div>
        <div className="mt-3 space-y-2.5">
          {GEST.filter((k) => form.gestion[k].on).map((k) => (
            <GestionCard key={k} tipo={k} campos={form.gestion[k].campos} setCampos={(c) => setGest(k, { ...form.gestion[k], campos: c })} />
          ))}
        </div>
      </section>
    </div>
  );
}

function GestionCard({ tipo, campos, setCampos }: { tipo: string; campos: string[]; setCampos: (c: string[]) => void }) {
  const inputId = `onb-gest-${tipo}`;
  const add = () => {
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    if (!el) return;
    const set = [...campos];
    el.value.split(",").map((s) => s.trim()).filter(Boolean).forEach((x) => { if (!set.includes(x)) set.push(x); });
    setCampos(set); el.value = "";
  };
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs font-bold">🗂️ Captura de datos · <span className="text-primary">{tipo}</span></div>
      {tipo === "Citas" ? (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
          <b className="text-foreground">Enlace de la cita</b> <span className="rounded bg-foreground px-1.5 py-0.5 text-[9px] font-bold uppercase text-background">Auto</span>
          <p className="mt-1">Se genera automáticamente según la configuración del flujo de agendamiento.</p>
        </div>
      ) : (
        <>
          <div className="my-2 flex flex-wrap items-center gap-1.5">
            {campos.length ? campos.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{c}<button type="button" onClick={() => setCampos(campos.filter((_, j) => j !== i))} className="opacity-70 hover:opacity-100">✕</button></span>
            )) : <span className="text-xs italic text-muted-foreground">Aún no hay campos. Agrega los que necesites.</span>}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input id={inputId} className={input} placeholder="Ej.: cc, nombre, dirección…" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
            <button type="button" onClick={add} className={addBtn}>+ Agregar</button>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────── Paso 5: revisar ───────────────────
function StepReview({ form, obj, msgs, extra, goTo, customCount }: {
  form: Form; obj: Objective; msgs: string[]; extra: { title: string; msg: string }[]; goTo: (i: number) => void; customCount: number;
}) {
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm"><span className="flex-none font-semibold text-muted-foreground">{k}</span><span className="break-words text-right font-semibold">{v || "—"}</span></div>
  );
  const Edit = ({ s }: { s: number }) => (
    <button type="button" onClick={() => goTo(s)} className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-primary hover:border-primary">Editar ✏️</button>
  );
  const Head = ({ t, s }: { t: string; s: number }) => (
    <div className="mb-2 flex items-center justify-between gap-2 border-b border-border pb-2"><h3 className="text-sm font-bold">{t}</h3><Edit s={s} /></div>
  );
  const b = form.biz;
  const gestOn = GEST.filter((k) => form.gestion[k].on);
  const totalSteps = obj.steps.length + extra.length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Revisa que todo esté bien. Puedes <b>editar</b> cualquier sección antes de publicar.</p>

      <div className="rounded-2xl border border-border p-4">
        <Head t="🏢 Tu negocio" s={0} />
        <Row k="Nombre" v={b.nombre} /><Row k="Rubro" v={b.sector} /><Row k="¿Qué ofrece?" v={b.ofrece} />
        <Row k="Ubicación" v={b.ubicacion} /><Row k="Horarios" v={b.horario} /><Row k="Contacto" v={b.telefono} />
        <Row k="Sitio / red social" v={b.sitio} />{b.notas.trim() && <Row k="Notas" v={b.notas} />}
      </div>

      <div className="rounded-2xl border border-border p-4">
        <Head t="🎯 Objetivo y camino" s={1} />
        <Row k="Objetivo" v={obj.title} />
        <div className="mt-2 mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Camino del cliente · {totalSteps} pasos</div>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {obj.steps.map((s, i) => { const t = (msgs[i] ?? "").trim(); return <li key={i}><b>{s.t}</b>{t && <em className="not-italic text-muted-foreground"> — “{t.length > 60 ? t.slice(0, 60) + "…" : t}”</em>}</li>; })}
          {extra.map((s, i) => <li key={`x${i}`}><b>{s.title || "(sin nombre)"}</b>{s.msg.trim() && <em className="not-italic text-muted-foreground"> — “{s.msg.length > 60 ? s.msg.slice(0, 60) + "…" : s.msg}”</em>}</li>)}
        </ol>
      </div>

      <div className="rounded-2xl border border-border p-4">
        <Head t="📋 Contenido" s={3} />
        <Row k="Medios de pago" v={form.pagos} />
        <div className="mt-2 mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Preguntas frecuentes</div>
        <ul className="list-disc space-y-1 pl-5 text-sm">{form.faq.filter((x) => x.q.trim()).map((x, i) => <li key={i}>{x.q}</li>)}{!form.faq.some((x) => x.q.trim()) && <li className="text-muted-foreground">—</li>}</ul>
        <div className="mt-2 mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Productos / servicios</div>
        <ul className="list-disc space-y-1 pl-5 text-sm">{form.products.filter((x) => x.name.trim()).map((x, i) => <li key={i}>{x.name}{x.desc.trim() && <span className="text-muted-foreground"> · {x.desc}</span>}</li>)}{!form.products.some((x) => x.name.trim()) && <li className="text-muted-foreground">—</li>}</ul>
        {form.extras.trim() && <Row k="Extras" v={form.extras} />}
        <Row k="El agente registra" v={gestOn.length ? gestOn.map((k) => (k === "Citas" ? "Citas (enlace automático)" : `${k} (${form.gestion[k].campos.length} campos)`)).join(", ") : "—"} />
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3.5">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-emerald-500 text-sm font-extrabold text-white">✓</span>
        <div><div className="text-sm font-bold">Todo listo para publicar</div><div className="mt-0.5 text-xs text-muted-foreground">Al activar, tu Agente IA empieza a atender con esta configuración. Podrás ajustar todo desde “Agente IA”.</div></div>
      </div>
    </div>
  );
}

// ─────────────────── Pantalla final ───────────────────
function SuccessScreen({ onConnect, onLater }: { onConnect: () => void; onLater: () => void }) {
  const Item = ({ done, children }: { done?: boolean; children: React.ReactNode }) => (
    <div className={`rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${done ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-border text-muted-foreground"}`}>{children}</div>
  );
  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 text-center">
      <div className="text-5xl">🎉</div>
      <h2 className="mt-2 text-xl font-extrabold tracking-tight">¡Tu Agente IA quedó configurado!</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Guardamos todo. Falta <b>un último paso</b> para que empiece a atender a tus clientes: <b>conectar tu WhatsApp</b>.</p>
      <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2 text-left">
        <Item done>✓&nbsp; Agente configurado</Item>
        <Item>2 ·&nbsp; Conectar tu WhatsApp (escanear QR)</Item>
        <Item>3 ·&nbsp; Encender el agente</Item>
      </div>
      <button type="button" onClick={onConnect} className="mx-auto mt-6 block w-full max-w-sm rounded-xl bg-primary py-3.5 text-[15px] font-bold text-primary-foreground shadow-md hover:opacity-90">📱 Conectar mi WhatsApp</button>
      <button type="button" onClick={onLater} className="mx-auto mt-3 block text-sm text-muted-foreground hover:text-foreground">Lo hago después · ver mi agente</button>
    </div>
  );
}
