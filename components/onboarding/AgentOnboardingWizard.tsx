"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getAgentOnboardingState,
  dismissAgentOnboarding,
  completeAgentOnboarding,
} from "@/actions/agent-onboarding-actions";

/**
 * Asistente de primer arranque: aparece automáticamente cuando el dueño entra
 * por primera vez y su Agente IA aún no está configurado. Lo guía a "dar de
 * alta" el agente (negocio → objetivo → camino → publicar). No rompe nada de lo
 * existente: guarda en el mismo entrenamiento y todo queda versionado.
 */

type Objective = { id: string; emoji: string; title: string; desc: string; steps: string[] };

const OBJECTIVES: Objective[] = [
  { id: "venta-directa", emoji: "⚡", title: "Venta Directa", desc: "Ventas rápidas: intención, presentación y cierre.", steps: ["Bienvenida", "Averiguación", "Exposición", "Acuerdo", "Postventa"] },
  { id: "venta-consultiva", emoji: "🎯", title: "Venta Consultiva", desc: "6 fases: conexión, diagnóstico, propuesta y acuerdo.", steps: ["Bienvenida", "Entender necesidad", "Diagnóstico", "Presentación", "Propuesta de cita", "Acuerdo"] },
  { id: "agendamiento-citas", emoji: "📅", title: "Agendar citas", desc: "Ofrece horarios y reserva en el calendario.", steps: ["Bienvenida", "Servicio", "Disponibilidad", "Confirmación", "Recordatorio"] },
  { id: "calificacion-leads", emoji: "🧲", title: "Calificar leads", desc: "Detecta quién está listo para comprar.", steps: ["Bienvenida", "Calificación", "Urgencia", "Presupuesto", "Derivar a asesor"] },
  { id: "atencion-cliente", emoji: "🎧", title: "Atención / soporte", desc: "Resuelve dudas, solicitudes y reclamos.", steps: ["Bienvenida", "Identificación", "Validación", "Resolución", "Cierre"] },
  { id: "pedidos-delivery", emoji: "🛵", title: "Pedidos / Delivery", desc: "Arma el pedido, cross-sell y confirma envío.", steps: ["Bienvenida", "Pedido", "Resumen", "Entrega", "Pago", "Seguimiento"] },
];

const STEP_TITLES = ["Tu negocio", "Objetivo del agente", "Camino del cliente", "Revisar y activar"];

const inputCls =
  "w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-background";

export function AgentOnboardingWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [nombre, setNombre] = useState("");
  const [sector, setSector] = useState("");
  const [ofrece, setOfrece] = useState("");
  const [horarios, setHorarios] = useState("");
  const [pagos, setPagos] = useState("");
  const [tono, setTono] = useState("Cercano");
  const [objectiveId, setObjectiveId] = useState<string>("venta-consultiva");

  useEffect(() => {
    let cancel = false;
    getAgentOnboardingState()
      .then((s) => {
        if (!cancel && s.show) {
          setNombre((prev) => prev || "");
          setOpen(true);
        }
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  // Permite relanzar el asistente a voluntad (ej. desde el checklist del Inicio),
  // sin cambiar su comportamiento automático de primer arranque.
  useEffect(() => {
    const openOnDemand = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("agent-onboarding:open", openOnDemand);
    return () => window.removeEventListener("agent-onboarding:open", openOnDemand);
  }, []);

  if (!open) return null;

  const objective = OBJECTIVES.find((o) => o.id === objectiveId) ?? OBJECTIVES[1];
  const canNext = step === 0 ? nombre.trim().length > 0 : true;
  const isLast = step === STEP_TITLES.length - 1;

  const skip = async () => {
    setOpen(false);
    await dismissAgentOnboarding().catch(() => {});
  };

  const publish = async () => {
    setSaving(true);
    const res = await completeAgentOnboarding({
      business: { nombre, sector, ofrece, horarios, pagos, tono },
      objectiveId,
    });
    setSaving(false);
    if (res.ok) {
      toast.success("¡Tu Agente IA quedó dado de alta! 🎉");
      setOpen(false);
      router.push("/ia");
      router.refresh();
    } else {
      toast.error(res.error || "No se pudo dar de alta el agente.");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 sm:p-6">
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-primary text-lg font-extrabold italic text-primary-foreground">
            V
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">Da de alta tu Agente IA</h2>
            <p className="text-xs text-muted-foreground">Configúralo en unos pasos. Podrás ajustarlo cuando quieras.</p>
          </div>
          <button
            type="button"
            onClick={skip}
            className="ml-auto flex-none rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Hacerlo después
          </button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 px-5 pt-4 sm:px-6">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${((step + 1) / STEP_TITLES.length) * 100}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            Paso {step + 1} de {STEP_TITLES.length}
          </span>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
            Paso {step + 1} · {STEP_TITLES[step]}
          </p>

          {step === 0 && (
            <div className="mt-3 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold">Nombre del negocio</span>
                  <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Clínica Sofía" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold">Rubro / industria</span>
                  <input className={inputCls} value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Ej. Salud y estética" />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold">¿Qué ofreces? <span className="font-normal text-muted-foreground">— en una frase</span></span>
                <input className={inputCls} value={ofrece} onChange={(e) => setOfrece(e.target.value)} placeholder="Ej. Tratamientos estéticos con cita previa" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold">Horario de atención</span>
                  <input className={inputCls} value={horarios} onChange={(e) => setHorarios(e.target.value)} placeholder="Ej. Lun a Sáb, 9:00–19:00" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold">Métodos de pago <span className="font-normal text-muted-foreground">— tus propios</span></span>
                  <input className={inputCls} value={pagos} onChange={(e) => setPagos(e.target.value)} placeholder="Ej. Efectivo, Transferencia, Yape…" />
                </label>
              </div>
              <div>
                <span className="mb-1 block text-xs font-semibold">Tono del agente</span>
                <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
                  {["Formal", "Cercano", "Divertido"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTono(t)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${tono === t ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="mt-3">
              <p className="mb-3 text-sm text-muted-foreground">¿Qué debe hacer el agente principalmente?</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {OBJECTIVES.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setObjectiveId(o.id)}
                    className={`relative rounded-xl border p-3 text-left transition-all ${objectiveId === o.id ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary/60"}`}
                  >
                    <div className="text-xl">{o.emoji}</div>
                    <div className="mt-1.5 text-sm font-bold">{o.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{o.desc}</div>
                    {objectiveId === o.id && (
                      <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-xs text-primary-foreground">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-3">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold text-violet-500">
                ✦ Generado según tu objetivo
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                Así atenderá tu agente ({objective.title}). Podrás editar cada paso luego en el editor.
              </p>
              <ol className="space-y-2">
                {objective.steps.map((s, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                    <span className="grid h-6 w-6 flex-none place-items-center rounded-full border-2 border-primary text-xs font-bold text-primary tabular-nums">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {step === 3 && (
            <div className="mt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Negocio", nombre || "—"],
                  ["Rubro", sector || "—"],
                  ["Objetivo", objective.title],
                  ["Camino del cliente", `${objective.steps.length} pasos`],
                  ["Tono", tono],
                  ["Métodos de pago", pagos || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5 rounded-xl border border-border bg-muted/30 px-3.5 py-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</span>
                    <span className="text-sm font-bold">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3.5">
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-emerald-500 text-sm font-extrabold text-white">✓</span>
                <div>
                  <div className="text-sm font-bold">Todo listo para publicar</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Al activar, tu Agente IA empieza a atender con este camino en WhatsApp. Puedes ajustarlo cuando quieras desde “Agente IA”.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-border bg-muted/30 px-5 py-3.5 sm:px-6">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            ← Atrás
          </button>
          {!isLast ? (
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setStep((s) => s + 1)}
              className="ml-auto rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-40"
            >
              Siguiente →
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void publish()}
              className="ml-auto rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Activando…" : "✦ Publicar agente"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
